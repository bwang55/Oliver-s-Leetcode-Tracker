import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import { Duration } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface MonitoringOpts {
  alarmEmail: string;
  lambdaFunctionNames: {
    extractProblem?: string;
    chatStream: string;
    mcpServer: string;
    exportData: string;
    postConfirmation?: string;
  };
  appsyncApiId?: string;
}

export function defineMonitoring(scope: Construct, opts: MonitoringOpts): sns.Topic {
  const topic = new sns.Topic(scope, "OpsAlarmTopic", {
    displayName: "lc-tracker ops alarms"
  });
  topic.addSubscription(new snsSubs.EmailSubscription(opts.alarmEmail));

  const lambdaErrorAlarm = (id: string, fnName: string, threshold: number) =>
    new cloudwatch.Alarm(scope, id, {
      metric: new cloudwatch.Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensionsMap: { FunctionName: fnName },
        statistic: cloudwatch.Stats.SUM,
        period: Duration.minutes(5)
      }),
      threshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: `${fnName}: errors > ${threshold} in 5 minutes`
    }).addAlarmAction(new cwActions.SnsAction(topic));

  const lambdaInvocationsAlarm = (id: string, fnName: string, hourly: number) =>
    new cloudwatch.Alarm(scope, id, {
      metric: new cloudwatch.Metric({
        namespace: "AWS/Lambda",
        metricName: "Invocations",
        dimensionsMap: { FunctionName: fnName },
        statistic: cloudwatch.Stats.SUM,
        period: Duration.hours(1)
      }),
      threshold: hourly,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: `${fnName}: invocations > ${hourly}/hour (anomaly)`
    }).addAlarmAction(new cwActions.SnsAction(topic));

  // Errors per Lambda
  lambdaErrorAlarm("ChatStreamErrors", opts.lambdaFunctionNames.chatStream, 5);
  lambdaErrorAlarm("McpServerErrors", opts.lambdaFunctionNames.mcpServer, 5);
  lambdaErrorAlarm("ExportDataErrors", opts.lambdaFunctionNames.exportData, 5);
  if (opts.lambdaFunctionNames.postConfirmation) {
    lambdaErrorAlarm("PostConfirmationErrors", opts.lambdaFunctionNames.postConfirmation, 5);
  }

  // Volume anomalies (per hour)
  lambdaInvocationsAlarm("ChatStreamVolume", opts.lambdaFunctionNames.chatStream, 500);
  lambdaInvocationsAlarm("McpServerVolume", opts.lambdaFunctionNames.mcpServer, 1000);

  // AppSync 5xx errors (if api ID provided)
  if (opts.appsyncApiId) {
    new cloudwatch.Alarm(scope, "AppSync5xxAlarm", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/AppSync",
        metricName: "5XXError",
        dimensionsMap: { GraphQLAPIId: opts.appsyncApiId },
        statistic: cloudwatch.Stats.SUM,
        period: Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "AppSync: 5XX errors > 5 in 5 minutes"
    }).addAlarmAction(new cwActions.SnsAction(topic));
  }

  return topic;
}
