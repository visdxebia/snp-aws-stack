const {Stack, Fn, CfnOutput} = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require('aws-cdk-lib/aws-lambda');
const apiGatewayResourcesConfig = require("../../services/APIGateway/resourceConfig.json");
const path = require("path");
const fs = require("fs");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const s3 = require("aws-cdk-lib/aws-s3");

class ApiGatewayInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const {allEntities = [], envName, domain} = props;
    // Create Rest API
    const api = new apigateway.RestApi(this, 'krny-spi-dashboard-apiGateway', {
      restApiName: `spi-dashboards-${envName}`,
      description: 'Created by CDK',
      deployOptions: {
        stageName: envName,
      }
    });

    new CfnOutput(this, `gatewayRootUrl`, {
      value: api.url,
      description: `The deployed root URL of this REST API.`,
      exportName: `gatewayRootUrl`,
    });
    new CfnOutput(this, `gatewayBaseDeploymentStage`, {
      value: api.deploymentStage.stageName,
      description: `API Gateway stage that points to the latest deployment.`,
      exportName: `gatewayBaseDeploymentStage`,
    });




    allEntities.forEach(entity =>{
      const clientId = entity.id;

      // Add Root Resource
      const rootResource = api.root.addResource(`${envName}${clientId}`);

      const cognitoUserPoolId = Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
      const userPool = cognito.UserPool.fromUserPoolId(this, `apiGateway${clientId}CogAuthorizerRef`, cognitoUserPoolId);

      const apiGatewayLambdaAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, `apiGateway${clientId}CogAuthorizer`, {
        cognitoUserPools: [userPool]
      });

      // Add Resources
      Object.keys(apiGatewayResourcesConfig).forEach(resourceName => {
        const resourceConfig = apiGatewayResourcesConfig[resourceName];
        const resource = rootResource.addResource(resourceName);

        Object.keys(resourceConfig).forEach(methodName => {
          const methodConfig = resourceConfig[methodName];
          const integerationConfig = methodConfig.integrationRequest;

          const lambdaArn = Fn.importValue(`lambdaARN${integerationConfig.lambda}`);
          const backendLamdba = lambda.Function.fromFunctionArn(this, `backendLamdba${clientId}${resourceName}${methodName}`, lambdaArn);
          const method = resource.addMethod(
            methodName,
            new apigateway.LambdaIntegration(backendLamdba, {
              proxy: integerationConfig.proxy ?? false,
              requestTemplates: {
                "application/json": JSON.stringify(integerationConfig.mappingTemplate)
              },
              passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
              integrationResponses: [
                {
                  statusCode: "200",
                  responseTemplates: {
                    'application/json': ''
                  },
                },
              ],
            }),
            {
              authorizer: apiGatewayLambdaAuthorizer,
              authorizationType: apigateway.AuthorizationType.COGNITO,
              authorizationScopes: [`tenant/${clientId}`]
            }
          );
        })

        // resource.addMethod('OPTIONS', new apigateway.MockIntegration({
        //   integrationResponses: [{
        //     statusCode: '200',
        //     responseParameters: {
        //       'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        //       'method.response.header.Access-Control-Allow-Origin': "'*'",
        //       'method.response.header.Access-Control-Allow-Credentials': "'false'",
        //       'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
        //     },
        //   }],
        //   passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        //   requestTemplates: {
        //     "application/json": "{\"statusCode\": 200}"
        //   },
        // }), {
        //   methodResponses: [{
        //     statusCode: '200',
        //     responseParameters: {
        //       'method.response.header.Access-Control-Allow-Headers': true,
        //       'method.response.header.Access-Control-Allow-Methods': true,
        //       'method.response.header.Access-Control-Allow-Credentials': true,
        //       'method.response.header.Access-Control-Allow-Origin': true,
        //     },
        //   }]
        // })
        // resource.addCorsPreflight({
        //   allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        //   allowMethods: ['OPTIONS', 'GET', 'POST'],
        //   allowCredentials: true,
        //   allowOrigins: apigateway.Cors.ALL_ORIGINS,
        // });
      })
    });


    // const pathToDefaultDashboardBundle = path.join(__dirname, "../../services/DefaultUiBundle");
    // const POOLID_PALCEHOLDER = ":POOLID:";
    // const POOLWEBCLIENTID_PALCEHOLDER = ":POOLWEBCLIENTID:";
    // const POOLOAUTHDOMAIN_PALCEHOLDER = ":POOLOAUTHDOMAIN:";
    // const POOLREDIRECTSIGNIN_PALCEHOLDER = ":POOLREDIRECTSIGNIN:";
    // const POOLREDIRECTSIGNOUT_PALCEHOLDER = ":POOLREDIRECTSIGNOUT:";
    // const APIPREFIX_PALCEHOLDER = ":APIPREFIX:";
    // const APISTAGE_PALCEHOLDER = ":APISTAGE:";
    // const CLIENTID_PALCEHOLDER = ":CLIENTID:";
    // const CLIENTDISPLAYNAME_PALCEHOLDER = ":CLIENTDISPLAYNAME:";
    //
    // // Dashboards Bucket
    // const dashboardsBucketARN = Fn.importValue(`dashboardsBucketARN`);
    // const dashboardsBucket = s3.Bucket.fromBucketArn(this, `dashboardsBundleBucket`, dashboardsBucketARN);
    // allEntities.forEach(entity =>{
    //   const clientId = entity.id;
    //   const entityName = entity.name;
    //
    //   // Cognito Stack Imports
    //   const cognitoUserPoolId = Fn.importValue(`userpool${clientId}ResourceIdsUserPoolId`);
    //   const cognitoUserPoolWebClient = Fn.importValue(`userpool${clientId}ResourceIdsClientId`);
    //   const cognitoUserPoolDomain = Fn.importValue(`userpool${clientId}ResourceIdsDomain`);
    //   const cognitoUserPoolRedirectSignInPublicUrl = Fn.importValue(`userpool${clientId}redirectSignIn`);
    //   const cognitoUserPoolRedirectSignOutPublicUrl = Fn.importValue(`userpool${clientId}redirectSignOut`);
    //
    //   const idpConfigFilePath = path.join(pathToDefaultDashboardBundle, "idpConfig.js");
    //   let idpConfig = fs.readFileSync(idpConfigFilePath, "utf-8");
    //   idpConfig = idpConfig.replaceAll(POOLID_PALCEHOLDER, `${cognitoUserPoolId.toString()}`);
    //   idpConfig = idpConfig.replaceAll(POOLWEBCLIENTID_PALCEHOLDER, `${cognitoUserPoolWebClient.toString()}`);
    //   idpConfig = idpConfig.replaceAll(POOLOAUTHDOMAIN_PALCEHOLDER, `${cognitoUserPoolDomain}`);
    //   idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNIN_PALCEHOLDER, `${cognitoUserPoolRedirectSignInPublicUrl}`);
    //   idpConfig = idpConfig.replaceAll(POOLREDIRECTSIGNOUT_PALCEHOLDER, `${cognitoUserPoolRedirectSignOutPublicUrl}`);
    //
    //   idpConfig = idpConfig.replaceAll(APIPREFIX_PALCEHOLDER, `${api.url}`);
    //   idpConfig = idpConfig.replaceAll(APISTAGE_PALCEHOLDER, `${api.deploymentStage.stageName}`);
    //   idpConfig = idpConfig.replaceAll(CLIENTID_PALCEHOLDER, `${clientId}`);
    //   idpConfig = idpConfig.replaceAll(CLIENTDISPLAYNAME_PALCEHOLDER, `${entityName}`);
    //   fs.writeFileSync(path.join(pathToDefaultDashboardBundle, "idpConfig.js"), idpConfig);
    //
    //   const bucketDeployment = new s3deploy.BucketDeployment(this, `dashboard-bundler-${clientId}`, {
    //     sources: [s3deploy.Source.asset(pathToDefaultDashboardBundle)],
    //     destinationBucket: dashboardsBucket,
    //     destinationKeyPrefix: `dashboards/${clientId}/dashboard`
    //   });
    //
    //   bucketDeployment.node.addDependency(api);
    // })
  }
}

module.exports = {ApiGatewayInfraStack}
