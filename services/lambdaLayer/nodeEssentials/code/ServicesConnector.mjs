import url from "url";
import _ from "lodash";
import {STSClient} from "@aws-sdk/client-sts";
import {AssumeRoleCommand} from "@aws-sdk/client-sts";
import {
  AthenaClient
} from "@aws-sdk/client-athena";
import {S3Client} from "@aws-sdk/client-s3";
import _makeAthenaQuery from "./makeAthenaQuery.mjs";
import {
  EXECUTION_ROLE_NAME,
  ASSUME_ROLE_TAG,
  ASSUME_ROLE_ENV_TAG,
} from "./constants.mjs";

const DEV_LOCALHOST_PORT = "3000";
const QA_LOCALHOST_PORT = "3001";
const UAT_LOCALHOST_PORT = "3011";
const PROD_LOCALHOST_PORT = "3111";

function getenvSuffixFromOriginUrl(originUrl){
  const originUrlParsed = url.parse(originUrl);
  const hostName = _.get(originUrlParsed, "host");
  let env;
  if (_.startsWith(hostName, "localhost")){
    if (`${hostName}`.indexOf(DEV_LOCALHOST_PORT) !== -1){
      env = "dev"
    } else if (`${hostName}`.indexOf(QA_LOCALHOST_PORT) !== -1){
      env = "qa"
    } else if (`${hostName}`.indexOf(UAT_LOCALHOST_PORT) !== -1){
      env = "uat"
    } else if (`${hostName}`.indexOf(PROD_LOCALHOST_PORT) !== -1){
      env = ""
    } else {
      env = "dev"
    }
  } else {
    env = _.get(_.split(hostName, "."), "[1]");
  }

  if (env){
    env = `-${env}`
  }
  return env;
}

export default class ServicesConnector{
  constructor(awsAccountId, region) {
    this.awsAccountId = awsAccountId;
    this.region = region;
    this.eventTenantId = null;
    this._stsCredentials = {};
    this.envSuffix = null;
    this.athenaClient = null;
    this.s3Client = null;
    this.clientBucketName = "";
    this.stsClient = new STSClient({region: region});
  }

  async init(event){
    this.eventTenantId = _.get(_.split(_.find(_.split(event.scope, " "), v => _.startsWith(v, "tenant/")), "/"), "[1]"); // "3184919584"
    this.envSuffix = getenvSuffixFromOriginUrl(_.get(event, "origin"));

    const command = new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${this.awsAccountId}:role/${EXECUTION_ROLE_NAME}`,
      RoleSessionName: `assume-${EXECUTION_ROLE_NAME}-${this.eventTenantId}`,
      DurationSeconds: 900,
      Tags: [{
        'Key': ASSUME_ROLE_TAG,
        'Value': this.eventTenantId
      }, {
        'Key': ASSUME_ROLE_ENV_TAG,
        'Value': this.envSuffix
      }]
    });

    const stsResponse = await this.stsClient.send(command);
    this._stsCredentials = _.get(stsResponse, "Credentials");

    this.athenaClient = new AthenaClient({
      region: this.region,
      credentials: {
        accessKeyId: _.get(this._stsCredentials, "AccessKeyId"),
        expiration: _.get(this._stsCredentials, "Expiration"),
        secretAccessKey: _.get(this._stsCredentials, "SecretAccessKey"),
        sessionToken: _.get(this._stsCredentials, "SessionToken")
      }
    });

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: _.get(this._stsCredentials, "AccessKeyId"),
        expiration: _.get(this._stsCredentials, "Expiration"),
        secretAccessKey: _.get(this._stsCredentials, "SecretAccessKey"),
        sessionToken: _.get(this._stsCredentials, "SessionToken")
      }
    });

    this.clientBucketName = `krny-spi-${this.eventTenantId}${this.envSuffix}`
  }

  async makeAthenQuery(query, maxSleep = 40){
    return await _makeAthenaQuery(this.athenaClient, this.eventTenantId, this.envSuffix, query, maxSleep)
  }

  getS3Client(){
    return this.s3Client;
  }
}
