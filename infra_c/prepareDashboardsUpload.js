const getServiceNames = require("./lib/utils/getServiceName");
const path = require("path");
const fs = require("fs");
const { exec } = require('node:child_process')
const stackExports = require("./stackexports.json");
const {getExportName} = require("./lib/utils/stackExportsName");
const getAWSAccountAndRegion = require("./getAWSAccountAndRegion");

const dataSideClientOnboardingFurtherProcessingHandlerLambdaName = "client-onboarding-data"

const {awsAccount, awsRegion} = getAWSAccountAndRegion();
const domain = process.env.DOMAIN_NAME;
const envName = process.env.ENV_NAME;

const scannedClientTable = fs.readFileSync(path.join(__dirname, './bin/scannedClientTable.json'), "utf-8")
const clientsToOnboardConfigs = JSON.parse(scannedClientTable);

const cognitoStackExportsStartKey = 'krnysnpapplicationstackCognitoInfraStack';
const cognitoStackExportsKey = Object.keys(stackExports).filter(k => k.startsWith(cognitoStackExportsStartKey));
const cognitoExports = stackExports[cognitoStackExportsKey];

const apiGatewayStackExportsStartKey = 'krnysnpapplicationstackApiGatewayInfraStack';
const apiGatewayStackExportsKey = Object.keys(stackExports).filter(k => k.startsWith(apiGatewayStackExportsStartKey));
const apiGatewayExports = stackExports[apiGatewayStackExportsKey];

const dashboardsBucketName = getServiceNames.getDashboardsBucketName(envName)
console.log("dashboardsBucketName", dashboardsBucketName);
let sourcePath = path.join(__dirname, '../services/uiBundles/DefaultUiBundle');
const defaultIDPTemplate = fs.readFileSync(`${sourcePath}/idpConfig.js`, 'utf-8');

const getSuffixByClientId = (id)=>{
  const strigifiedEntityId = `${id}`;
  const strigifiedEntityIdLength = strigifiedEntityId.length;
  return strigifiedEntityId.substring(strigifiedEntityIdLength-3, strigifiedEntityIdLength);
}

clientsToOnboardConfigs.forEach((entity, iter) => {
  const clientId = entity.id;
  const host = entity.host;
  const clientName = entity.name;
  const adminEmail = entity.adminEmail;

  let idpConfigTemplateContents = `${defaultIDPTemplate}`;
  if (fs.existsSync(path.join(__dirname, `../services/uiBundles/${clientId}`))) {
    sourcePath = path.join(__dirname, `../services/uiBundles/${clientId}`);
    idpConfigTemplateContents = fs.readFileSync(`${sourcePath}/idpConfig.js`, 'utf-8');
  }

  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)region:.*/, `$1region: "${awsRegion}",`);

  const clientUserPoolID = cognitoExports[`Export${getExportName('userPoolId', {clientId})}`];
  const clientUserPoolWebClientId = cognitoExports[`Export${getExportName('userPoolClient', {clientId})}`];
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)userPoolId:.*/, `$1userPoolId: "${clientUserPoolID}",`);
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)userPoolWebClientId:.*/, `$1userPoolWebClientId: "${clientUserPoolWebClientId}",`);

  const oauthDomainFQDN = `${cognitoExports[`Export${getExportName('userPoolDomain', {clientId})}`]}.auth.us-east-1.amazoncognito.com`;
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)oauthDomain:.*/, `$1oauthDomain: "${oauthDomainFQDN}",`);

  const clientWebAppFQDN = `https://${host}.${domain}`;
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)redirectSignIn:.*/, `$1redirectSignIn: "${clientWebAppFQDN}",`);
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)redirectSignOut:.*/, `$1redirectSignOut: "${clientWebAppFQDN}",`);

  const gatewaySuffix = getSuffixByClientId(clientId);
  const gatewayRestApiId = apiGatewayExports[`Export${getExportName('apiGatewayRestApiId', {suffix: gatewaySuffix})}`];
  const gatewayStageName = apiGatewayExports[`Export${getExportName('apiGatewayDeploymentStage', {suffix: gatewaySuffix})}`];
  const clientApiRootResourcePath = apiGatewayExports[`Export${getExportName('apiGatewayRootResourcePath', {clientId})}`];
  const apiPrefix = `${gatewayRestApiId}.execute-api.${awsRegion}.amazonaws.com`;
  const stageRootResourcePath = `${gatewayStageName}${clientApiRootResourcePath}`;
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)apiPrefix:.*/, `$1apiPrefix: "${apiPrefix}",`);
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)stage:.*/, `$1stage: "${stageRootResourcePath}",`);

  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)clientId:.*/, `$1clientId: "${clientId}",`);
  idpConfigTemplateContents = idpConfigTemplateContents.replace(/(.*)clientDisplayName:.*/, `$1clientDisplayName: "${clientName}",`);


  const pathToDashboardsTempDir = path.join(__dirname, `dashboardsTemp`);
  const pathToDashboardsTempBundles = path.join(pathToDashboardsTempDir, `${clientId}/dashboard`);
  fs.mkdirSync(pathToDashboardsTempBundles, {recursive:true});
  fs.cpSync(sourcePath, pathToDashboardsTempBundles, {recursive: true});
  fs.writeFileSync(`${pathToDashboardsTempBundles}/idpConfig.js`, idpConfigTemplateContents);

  exec(`aws s3api head-object --bucket ${dashboardsBucketName} --key dashboards/${clientId}/dashboard/index.html`, (error, exists)=>{
    if (!exists){
      // Create lake permission command json file from template and call the permission command
      let commandJsonContent = fs.readFileSync("./dataLakePermissionTemplate.json", "utf-8");
      commandJsonContent = commandJsonContent.replaceAll(":123456789012:", awsAccount);
      const databaseName = `${clientId}-database-${envName}`;
      commandJsonContent = commandJsonContent.replaceAll(":DATABASENAME:", databaseName);
      const commandJSONFileName = `dataLakePermissionTemplate${clientId}.json`;
      fs.writeFileSync(`./${commandJSONFileName}`, commandJsonContent);
      exec(`aws lakeformation grant-permissions --cli-input-json file://${commandJSONFileName}`, (err, output)=>{
        if (err){
          console.log(`Error in granting permssion to role on database ${databaseName}`, err);
        }
        console.log(`Successfully granted permission to database ${databaseName}`, output);
      });
      ///
      ///
      ///
      const onboardDtISO = new Date().toISOString();
      exec(`aws dynamodb update-item --table-name "sensing-solution-tenant" --key '{"id": {"N": "${clientId}"}}' --update-expression "SET #H = :h" --expression-attribute-names '{"#H":"onboardDt"}' --expression-attribute-values '{":h":{"S":"${onboardDtISO}"}}'`, (err, output) => {
        if (err){
          console.log("Failed to update dyanmodb item with onboarding status.", err);
        } else {
          console.log("Updated dynamodb with onboarding status", output)
        }
      })
      exec(`aws s3 cp ${pathToDashboardsTempDir}/${clientId} s3://${dashboardsBucketName}/dashboards/${clientId} --recursive`, (err, output) => {
        if (err) {
          console.error("could not execute command: ", err)
          return
        }
        console.log("Output: \n", output)
      });
      console.log("Create Admin User and sending email...")
      exec(`aws cognito-idp admin-create-user --user-pool-id ${clientUserPoolID} --username ${adminEmail} --user-attributes Name=email,Value=${adminEmail} Name=email_verified,Value=True --desired-delivery-mediums EMAIL --no-force-alias-creation`, (err, output) => {
        if (err) {
          console.error("Failed to Admin User!!! ", err)
          return
        }
        console.log("Admin user created, email sent. \n", output);
        console.log("Adding user to admin group");
        exec(`aws cognito-idp admin-add-user-to-group --user-pool-id ${clientUserPoolID} --username ${adminEmail} --group-name Admin`, (err1, out1)=>{
          if (err1){
            console.log("Failed to add user to Admin group")
          }
          console.log("Added user to Admin group");
        })
      })
      console.log("Upading hosted UI logo...")
      exec(`aws cognito-idp set-ui-customization --user-pool-id ${clientUserPoolID} --client-id ${clientUserPoolWebClientId} --image-file fileb://./Kearney_Logo.svg.png --css  ".banner-customizable {background-color: #ffffff;} .submitButton-customizable:hover {background-color: #802d2c;} .submitButton-customizable {background-color: #000000;} .textDescription-customizable {font-family: serif}"`, (err, output) => {
        if (err) {
          console.error("Failed to update logo: ", err)
          return
        }
        console.log("Logo Updated: \n", output)
      })
    }
  })
})
