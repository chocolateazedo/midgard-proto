import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  type Datapoint,
} from "@aws-sdk/client-cloudwatch";

/**
 * Wrapper pra consultar métricas CloudWatch do IVS.
 *
 * Métricas usadas:
 * - LiveDeliveredTime (minutos de vídeo entregues somados entre todos os viewers
 *   durante a janela consultada). Unidade: minutos.
 * - ConcurrentViews (snapshot de viewers simultâneos).
 *
 * CloudWatch tem delay de ~2-5 min pra consolidar métricas de IVS, por isso
 * o worker de custo finalizer roda com delay.
 */

const IVS_REGION = process.env.IVS_REGION ?? "us-east-1";

let _client: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!_client) {
    _client = new CloudWatchClient({ region: IVS_REGION });
  }
  return _client;
}

/**
 * Retorna o total de "delivered minutes" do IVS pra um canal numa janela.
 * Usa Sum sobre período de 60s, depois soma os datapoints.
 */
export async function getLiveDeliveredMinutes(
  channelName: string,
  startTime: Date,
  endTime: Date
): Promise<number> {
  const resp = await getClient().send(
    new GetMetricStatisticsCommand({
      Namespace: "AWS/IVS",
      MetricName: "LiveDeliveredTime",
      Dimensions: [{ Name: "Channel", Value: channelName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 60,
      Statistics: ["Sum"],
    })
  );

  const datapoints = (resp.Datapoints ?? []) as Datapoint[];
  return datapoints.reduce((total, dp) => total + (dp.Sum ?? 0), 0);
}

/**
 * Retorna o pico de viewers simultâneos no canal durante a janela.
 */
export async function getPeakConcurrentViewers(
  channelName: string,
  startTime: Date,
  endTime: Date
): Promise<number> {
  const resp = await getClient().send(
    new GetMetricStatisticsCommand({
      Namespace: "AWS/IVS",
      MetricName: "ConcurrentViews",
      Dimensions: [{ Name: "Channel", Value: channelName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 60,
      Statistics: ["Maximum"],
    })
  );

  const datapoints = (resp.Datapoints ?? []) as Datapoint[];
  return datapoints.reduce(
    (max, dp) => Math.max(max, Math.round(dp.Maximum ?? 0)),
    0
  );
}
