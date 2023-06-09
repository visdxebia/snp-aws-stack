#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const getAWSAccountAndRegion = require("../getAWSAccountAndRegion");
const krnySnpApplicationStack = require('../lib/krny-snp-application-stack');
const fs = require("fs");
const path = require("path");

// let envVal = process.env.clientonboardingconfig;
// envVal = envVal.replaceAll("'", "");
// const cdkConfig = JSON.parse(`${envVal}`);

// const cdkConfig = {
//     "awsAccount": "932399466203",
//     "region": "us-east-1",
//     "envName": "alpha",
//     "certificateArn": "arn:aws:acm:us-east-1:932399466203:certificate/c5e8eacd-3c2c-476d-9a41-46d45d5c32b9",
//     "domain": "alpha.kearneysnp.com",
// }

// const cdkConfig = {
//   "awsAccount": "396112814485",
//   "region": "us-east-1",
//   "envName": "uat",
//   "certificateArn": "arn:aws:acm:us-east-1:396112814485:certificate/65a019d1-066a-4d48-8677-0eff3581064f",
//   "domain": "testvisd.online"
// }

const scannedClientTable = fs.readFileSync(path.join(__dirname, './scannedClientTable.json'), "utf-8")
const clientsToOnboardConfigs = JSON.parse(scannedClientTable);

const {awsAccount, awsRegion} = getAWSAccountAndRegion();
const app = new cdk.App();
const props = {
  env: { account: awsAccount, region: awsRegion },
  clientsToOnboardConfigs
}

if (process.env.CODEBUILD_BUILD_NUMBER > 1){
  const appStack = new krnySnpApplicationStack(app, 'krny-snp-application-stack', props);
}
