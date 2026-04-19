# AWS setup runbook — deploy do botflow no cluster `topfans`

Runbook passo-a-passo pra provisionar a infra AWS do `top-fans-telegram` reusando o cluster EKS `topfans` existente, com isolamento total do v1. Todos os valores já estão pré-preenchidos com a infra real da conta.

> **Regra de ouro**: cada operação de `kubectl apply` passa primeiro por `--dry-run=server`. Cada comando AWS é aditivo (nunca modifica recurso do v1). Rollback completo no final do documento.

## Contexto e pré-requisitos

| Item | Valor |
|---|---|
| Conta AWS | `241459378940` |
| Região | `sa-east-1` |
| Cluster EKS | `topfans` (k8s 1.32) |
| VPC | `vpc-05ecbe98a20fccace` |
| Subnets privadas (nodegroup + RDS) | `subnet-047c32e93a282838a` (1a), `subnet-0996c30ae51df6eb5` (1b) |
| Subnets públicas (ALB) | `subnet-01df6f696820f77e2` (1a), `subnet-0db986a35b0d78025` (1b) |
| SG dos nodes EKS | `sg-0d96dc5e53a5a0b89` |
| ECR registry | `241459378940.dkr.ecr.sa-east-1.amazonaws.com` |

**Ferramentas exigidas** (já instaladas localmente): `aws`, `eksctl`, `kubectl`, `docker`, `openssl`.

**Decidir antes de começar:**
- Subdomínio público do botflow (ex.: `bot.seudominio.com.br`). Referido abaixo como `<DOMAIN>`.
- Onde está hospedado o DNS desse domínio (você vai precisar criar 2 registros: um CNAME de validação do ACM e um CNAME pro ALB).

---

## Variáveis de ambiente do operador

Exportar no shell **antes** de rodar qualquer comando:

```bash
export AWS_REGION=sa-east-1
export AWS_ACCOUNT_ID=241459378940
export CLUSTER_NAME=topfans
export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
export DOMAIN=bot.SEU-DOMINIO.com.br   # <-- EDITAR

# Gerar/colar os segredos (só copiar mentalmente, não exportar em plaintext em histórico)
export DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export ENCRYPTION_SECRET=$(openssl rand -base64 32)
export SEED_OWNER_PASSWORD='<escolher-senha-forte>'
export SEED_OWNER_EMAIL='admin@SEU-DOMINIO.com.br'
export SEED_OWNER_NAME='Admin'

echo "DB_PASSWORD salvo em variável (NÃO comitar em lugar nenhum)"
echo "NEXTAUTH_SECRET salvo"
echo "ENCRYPTION_SECRET salvo"
```

⚠️ **IMPORTANTE**: anotar `NEXTAUTH_SECRET`, `ENCRYPTION_SECRET` e `DB_PASSWORD` em gerenciador de senha seguro. Se perder o `ENCRYPTION_SECRET` depois do primeiro deploy, **todos** os tokens criptografados no banco (tokens Telegram, API keys Pix, etc.) ficam inutilizáveis.

---

## Passo 1 — Criar repositório ECR

```bash
aws ecr create-repository \
  --repository-name botflow-web \
  --region ${AWS_REGION} \
  --image-scanning-configuration scanOnPush=true \
  --tags Key=project,Value=botflow Key=env,Value=prod
```

Verificação:
```bash
aws ecr describe-repositories --repository-names botflow-web --region ${AWS_REGION}
```

**Nota:** uma única imagem serve pra web E workers — eles diferem só pelo `command` sobrescrito no k8s Deployment.

---

## Passo 2 — Solicitar certificado ACM

```bash
aws acm request-certificate \
  --domain-name ${DOMAIN} \
  --validation-method DNS \
  --region ${AWS_REGION} \
  --tags Key=project,Value=botflow
```

Retorna um `CertificateArn` — anotar, vai ser usado em `k8s/08-ingress.yaml`.

**Validação DNS:**
```bash
# Pegar o nome/valor do CNAME de validação que o ACM criou
aws acm describe-certificate \
  --certificate-arn <arn-retornado> \
  --region ${AWS_REGION} \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Criar esse CNAME no seu provedor DNS. O ACM valida em ~5–30 min. Checar status:
```bash
aws acm describe-certificate --certificate-arn <arn> --region ${AWS_REGION} \
  --query 'Certificate.Status'
# → deve virar "ISSUED"
```

Enquanto espera a validação, seguir pros próximos passos (eles não dependem do cert).

---

## Passo 3 — Build & push da primeira imagem

```bash
# Login no ECR
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}

cd /home/rafa/dev/top-fans-telegram

# Build
docker build \
  -t ${ECR_REGISTRY}/botflow-web:latest \
  -t ${ECR_REGISTRY}/botflow-web:$(date +%Y%m%d-%H%M) \
  .

# Push
docker push ${ECR_REGISTRY}/botflow-web:latest
docker push ${ECR_REGISTRY}/botflow-web:$(date +%Y%m%d-%H%M)
```

Verificação:
```bash
aws ecr describe-images --repository-name botflow-web --region ${AWS_REGION} \
  --query 'imageDetails[].[imageTags,imagePushedAt,imageSizeInBytes]' --output table
```

---

## Passo 4 — Criar nodegroup dedicado `botflow-nodes`

Usa **eksctl** (o cluster foi criado com eksctl, consistência de tooling).

Criar o arquivo de config:

```bash
cat > /tmp/eksctl-botflow-nodes.yaml <<'EOF'
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: topfans
  region: sa-east-1
  version: "1.32"

managedNodeGroups:
  - name: botflow-nodes
    instanceType: t3.small
    desiredCapacity: 2
    minSize: 1
    maxSize: 4
    volumeSize: 20
    volumeType: gp3
    privateNetworking: true
    amiFamily: AmazonLinux2023
    labels:
      workload: botflow
    taints:
      - key: workload
        value: "botflow"
        effect: NoSchedule
    tags:
      project: botflow
      env: prod
      Name: topfans-botflow-nodes-Node
EOF
```

Aplicar (operação **aditiva** — cria nodegroup novo, não toca nos existentes):

```bash
eksctl create nodegroup -f /tmp/eksctl-botflow-nodes.yaml
# → demora ~5 min
```

Verificação:
```bash
# Listar nodegroups — devem aparecer 3
eksctl get nodegroup --cluster topfans --region sa-east-1

# Ver nodes do botflow
kubectl get nodes -l workload=botflow

# Confirmar que o taint está aplicado
kubectl get nodes -l workload=botflow -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.taints}{"\n"}{end}'
# → cada linha deve mostrar: [{"effect":"NoSchedule","key":"workload","value":"botflow"}]

# Confirmar que v1 não foi afetado
kubectl -n topfans get pods -o wide
# → todos os pods v1 continuam nos nodes topfans-topfans-nodes-* (não nos botflow)
```

---

## Passo 5 — Criar RDS PostgreSQL

### 5.1 DB subnet group

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name botflow-db-subnets \
  --db-subnet-group-description "Subnet group dedicado ao RDS do botflow" \
  --subnet-ids subnet-047c32e93a282838a subnet-0996c30ae51df6eb5 \
  --tags Key=project,Value=botflow Key=env,Value=prod \
  --region ${AWS_REGION}
```

### 5.2 Security group

```bash
RDS_SG=$(aws ec2 create-security-group \
  --group-name botflow-rds-sg \
  --description "Libera 5432 do SG dos nodes EKS pro RDS botflow" \
  --vpc-id vpc-05ecbe98a20fccace \
  --region ${AWS_REGION} \
  --query 'GroupId' --output text)

echo "RDS_SG=${RDS_SG}"

# Libera 5432 apenas vindo do SG dos nodes EKS (sg-0d96dc5e53a5a0b89)
aws ec2 authorize-security-group-ingress \
  --group-id ${RDS_SG} \
  --protocol tcp --port 5432 \
  --source-group sg-0d96dc5e53a5a0b89 \
  --region ${AWS_REGION}

# Tag
aws ec2 create-tags --resources ${RDS_SG} \
  --tags Key=project,Value=botflow Key=env,Value=prod \
  --region ${AWS_REGION}
```

### 5.3 Instância RDS

Verificar versão do Postgres 16 disponível:
```bash
aws rds describe-db-engine-versions \
  --engine postgres --engine-version 16 \
  --region ${AWS_REGION} \
  --query 'DBEngineVersions[-1].EngineVersion' --output text
# → anotar a versão retornada, ex.: 16.6
```

Criar a instância (substituir `<VERSAO>` pelo valor acima):

```bash
aws rds create-db-instance \
  --db-instance-identifier botflow-postgres \
  --db-instance-class db.t4g.small \
  --engine postgres \
  --engine-version <VERSAO> \
  --master-username botflow \
  --master-user-password "${DB_PASSWORD}" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --db-name botflow \
  --db-subnet-group-name botflow-db-subnets \
  --vpc-security-group-ids ${RDS_SG} \
  --backup-retention-period 7 \
  --preferred-backup-window 06:00-07:00 \
  --preferred-maintenance-window sun:07:00-sun:08:00 \
  --no-publicly-accessible \
  --deletion-protection \
  --no-multi-az \
  --storage-encrypted \
  --auto-minor-version-upgrade \
  --enable-performance-insights \
  --performance-insights-retention-period 7 \
  --tags Key=project,Value=botflow Key=env,Value=prod \
  --region ${AWS_REGION}
```

Demora ~8–10 min pra ficar disponível.

Acompanhar:
```bash
aws rds describe-db-instances \
  --db-instance-identifier botflow-postgres \
  --region ${AWS_REGION} \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]' --output table
# → status deve virar "available"; anotar o Endpoint.Address
```

Armazenar o endpoint:
```bash
export RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier botflow-postgres --region ${AWS_REGION} \
  --query 'DBInstances[0].Endpoint.Address' --output text)
echo "RDS_ENDPOINT=${RDS_ENDPOINT}"
```

---

## Passo 6 — Configurar kubectl e snapshot do estado v1

```bash
aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${AWS_REGION}
kubectl config current-context
# → deve terminar em ":cluster/topfans"

# Snapshot do v1 ANTES de qualquer apply — pra conferir zero impacto depois
kubectl -n topfans get pods -o wide > /tmp/topfans-pods-before.txt
kubectl -n topfans get svc > /tmp/topfans-svc-before.txt
kubectl get nodes > /tmp/nodes-before.txt
echo "Snapshot salvo em /tmp/topfans-*-before.txt e /tmp/nodes-before.txt"
```

---

## Passo 7 — Criar o Secret local (NUNCA comitar)

```bash
cd /home/rafa/dev/top-fans-telegram

# Opção A: criar via kubectl sem arquivo local
kubectl create secret generic botflow-secrets -n botflow \
  --dry-run=client -o yaml \
  --from-literal=NEXTAUTH_SECRET="${NEXTAUTH_SECRET}" \
  --from-literal=NEXTAUTH_URL="https://${DOMAIN}" \
  --from-literal=ENCRYPTION_SECRET="${ENCRYPTION_SECRET}" \
  --from-literal=DATABASE_URL="postgresql://botflow:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/botflow?sslmode=require" \
  --from-literal=SEED_OWNER_EMAIL="${SEED_OWNER_EMAIL}" \
  --from-literal=SEED_OWNER_PASSWORD="${SEED_OWNER_PASSWORD}" \
  --from-literal=SEED_OWNER_NAME="${SEED_OWNER_NAME}" \
  > k8s/secret.yaml

# k8s/secret.yaml está no .gitignore — confirmar:
git check-ignore k8s/secret.yaml && echo "OK: secret.yaml ignorado pelo git"
```

Se preferir ter o Secret direto no cluster sem arquivo intermediário, substituir `> k8s/secret.yaml` por `| kubectl apply -f -` no comando acima e pular a aplicação desse arquivo mais pra frente.

---

## Passo 8 — Atualizar o Ingress com ACM + domínio

Após o certificado ACM ter status `ISSUED`:

```bash
# Editar k8s/08-ingress.yaml
#   - certificate-arn: arn:aws:acm:sa-east-1:241459378940:certificate/<UUID>
#   - host: bot.SEU-DOMINIO.com.br
```

Ou via sed (cuidado com o escape):
```bash
export CERT_ARN='<arn-emitido-pelo-acm>'
sed -i "s|arn:aws:acm:sa-east-1:241459378940:certificate/<preencher-após-criar-ACM>|${CERT_ARN}|" k8s/08-ingress.yaml
sed -i "s|bot.SEU-DOMINIO.com.br|${DOMAIN}|" k8s/08-ingress.yaml

git diff k8s/08-ingress.yaml  # conferir as substituições
```

---

## Passo 9 — Aplicar os manifests (dry-run primeiro)

### 9.1 Dry-run completo

```bash
for f in k8s/00-namespace.yaml k8s/01-config.yaml k8s/secret.yaml \
         k8s/03-redis.yaml k8s/04-migrate-job.yaml k8s/05-seed-job.yaml \
         k8s/06-web.yaml k8s/07-workers.yaml k8s/08-ingress.yaml; do
  echo "=== dry-run: $f ==="
  kubectl apply --dry-run=server -f "$f"
done
```

Se aparecer qualquer erro, **parar e resolver** antes do apply real.

### 9.2 Apply real, em ordem

```bash
# Namespace + quotas + priority class
kubectl apply -f k8s/00-namespace.yaml

# Config + secrets
kubectl apply -f k8s/01-config.yaml
kubectl apply -f k8s/secret.yaml

# Redis (com persistência)
kubectl apply -f k8s/03-redis.yaml
kubectl -n botflow wait --for=condition=available deployment/botflow-redis --timeout=180s
kubectl -n botflow logs deployment/botflow-redis --tail=20

# Migrate (Prisma db push)
kubectl apply -f k8s/04-migrate-job.yaml
kubectl -n botflow wait --for=condition=complete job/botflow-migrate --timeout=300s
kubectl -n botflow logs job/botflow-migrate

# Seed (owner inicial + platform_settings)
kubectl apply -f k8s/05-seed-job.yaml
kubectl -n botflow wait --for=condition=complete job/botflow-seed --timeout=180s
kubectl -n botflow logs job/botflow-seed

# Web (2 réplicas Next.js)
kubectl apply -f k8s/06-web.yaml
kubectl -n botflow wait --for=condition=available deployment/botflow-web --timeout=300s

# Workers (BullMQ)
kubectl apply -f k8s/07-workers.yaml
kubectl -n botflow wait --for=condition=available deployment/botflow-workers --timeout=300s

# Ingress ALB (demora ~2 min pra provisionar o ALB)
kubectl apply -f k8s/08-ingress.yaml
kubectl -n botflow get ingress botflow-web -w
# → aguardar ADDRESS aparecer (DNS do ALB), Ctrl+C depois
```

### 9.3 Checagem de impacto no v1

```bash
kubectl -n topfans get pods -o wide > /tmp/topfans-pods-after.txt
kubectl -n topfans get svc > /tmp/topfans-svc-after.txt
kubectl get nodes > /tmp/nodes-after.txt

diff /tmp/topfans-pods-before.txt /tmp/topfans-pods-after.txt
diff /tmp/topfans-svc-before.txt /tmp/topfans-svc-after.txt
diff /tmp/nodes-before.txt /tmp/nodes-after.txt
```

- Pods do v1: **zero mudança** (só variação de `AGE`, que é normal).
- Services do v1: **zero mudança**.
- Nodes: 2 novos `ip-10-0-1*` com label `botflow-nodes`, mas nenhum pod v1 rodando neles.

---

## Passo 10 — DNS final e smoke tests

### 10.1 Apontar o DNS pro ALB

```bash
ALB_DNS=$(kubectl -n botflow get ingress botflow-web \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "ALB_DNS=${ALB_DNS}"
```

Criar um CNAME no seu provedor DNS:
```
bot.SEU-DOMINIO.com.br → <ALB_DNS>
```

Aguardar propagação (~1–5 min).

### 10.2 Smoke tests

```bash
# Health check
curl -fsS https://${DOMAIN}/api/diagnostics | jq .

# Login page responde
curl -sI https://${DOMAIN}/login | head -5

# Logar como owner com SEED_OWNER_EMAIL/PASSWORD no browser
```

Se tudo estiver OK, configurar no painel `/admin/settings`:
- Wasabi (storage): bucket, region, endpoint, access key, secret key
- Pix (EFI/Woovi): credenciais
- Platform: nome, taxa

---

## Passo 11 — Configurar workers pra dar push no deploy

Deploys subsequentes (processo manual, parecido com o do v1):

```bash
cd /home/rafa/dev/top-fans-telegram

# Build + push
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}

TAG=$(date +%Y%m%d-%H%M)
docker build -t ${ECR_REGISTRY}/botflow-web:latest -t ${ECR_REGISTRY}/botflow-web:${TAG} .
docker push ${ECR_REGISTRY}/botflow-web:latest
docker push ${ECR_REGISTRY}/botflow-web:${TAG}

# Migrate (se houve mudança de schema)
kubectl -n botflow delete job botflow-migrate --ignore-not-found
kubectl apply -f k8s/04-migrate-job.yaml
kubectl -n botflow wait --for=condition=complete job/botflow-migrate --timeout=300s

# Rollout
kubectl -n botflow rollout restart deployment/botflow-web
kubectl -n botflow rollout restart deployment/botflow-workers
kubectl -n botflow rollout status deployment/botflow-web --timeout=300s
kubectl -n botflow rollout status deployment/botflow-workers --timeout=300s
```

Futuramente, dá pra trocar esse processo manual por GitHub Actions (OIDC + ECR + kubectl). Fica pra uma fase posterior.

---

## Rollback completo (caso o deploy dê problema)

Em **qualquer ponto** da execução, dá pra desfazer tudo do botflow sem afetar o v1:

```bash
# 1. Remove tudo do namespace botflow
kubectl delete namespace botflow --wait

# 2. Remove o nodegroup dedicado (espera ~5 min)
eksctl delete nodegroup --cluster topfans --name botflow-nodes \
  --region sa-east-1 --wait

# 3. Deleta o RDS (precisa desligar deletion protection primeiro)
aws rds modify-db-instance \
  --db-instance-identifier botflow-postgres \
  --no-deletion-protection --apply-immediately --region sa-east-1
aws rds delete-db-instance \
  --db-instance-identifier botflow-postgres \
  --skip-final-snapshot --region sa-east-1

# 4. Limpa subnet group e security group (depois do RDS sumir)
aws rds delete-db-subnet-group --db-subnet-group-name botflow-db-subnets --region sa-east-1
aws ec2 delete-security-group --group-id ${RDS_SG} --region sa-east-1

# 5. Deleta ECR (opcional)
aws ecr delete-repository --repository-name botflow-web --force --region sa-east-1

# 6. Deleta ACM cert (opcional)
aws acm delete-certificate --certificate-arn <arn> --region sa-east-1

# 7. Confirma v1 intocado
kubectl -n topfans get pods
eksctl get nodegroup --cluster topfans --region sa-east-1
```

Estado pós-rollback: cluster `topfans` exatamente como estava antes, v1 rodando normalmente.

---

## Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| Pods do botflow em `Pending` com `Insufficient cpu/memory` | Taint/toleration não bateu, ou ResourceQuota excedida | `kubectl describe pod -n botflow <pod>` — ver eventos |
| `botflow-migrate` falha com connection refused | RDS ainda não está `available` ou SG não libera | Testar de dentro de um pod: `kubectl -n botflow run -it --rm pgtest --image=postgres:16-alpine --restart=Never -- sh`, depois `psql $DATABASE_URL` |
| ALB não provisiona | AWS Load Balancer Controller com problema, ou cert não ISSUED | `kubectl -n kube-system logs deployment/aws-load-balancer-controller`, checar status do cert |
| `/api/diagnostics` retorna 500 | Redis ou DB inalcançável | `kubectl -n botflow logs deployment/botflow-web` |
| Pods do v1 ficam instáveis | **NÃO DEVE ACONTECER** — nodegroup/taint/namespace isolam | Abortar deploy: `kubectl delete namespace botflow`. Investigar antes de tentar de novo. |

---

## Próximas fases (não incluídas neste runbook)

- **Fase 4 — IVS integration**: Prisma migration (`LiveStreamSession`), refactor de `live.actions.ts`, webhook EventBridge, worker de custo finalizer, admin pages. Requer criar IAM role pra IRSA.
- **Fase 5 — Dockerfile tweak**: confirmar ffmpeg no runner stage.

Cada uma vai vir num runbook próprio.
