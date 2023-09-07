import * as cdk from 'aws-cdk-lib/core';
import * as auditmanager from 'aws-cdk-lib/aws-auditmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as awsconfig from 'aws-cdk-lib/aws-config';
import * as path from 'path';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';


export class AuditManagerStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        /*
        /////////////////////////////////////////////////////////////////////

            A - Enable Audit Manager part

        //////////////////////////////////////////////////////////////////////
        */

        // Create Lambda function
        const auditManagerLambda = new lambda.Function(this, 'EnableAuditManagerLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
        });

        // Add necessary permissions to Lambda function
        auditManagerLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['auditmanager:CreateAssessmentFramework'],
            resources: ['*'],
        }));


        const kmsCreateKeyPolicyStatement = new iam.PolicyStatement({
            actions: ['kms:CreateKey'],
            resources: ['*'],
        });

        auditManagerLambda.addToRolePolicy(kmsCreateKeyPolicyStatement);


        /*
        /////////////////////////////////////////////////////////////////////

            D - Create S3

        //////////////////////////////////////////////////////////////////////
        */

        const currentAccountId = cdk.Aws.ACCOUNT_ID;

        //Create an S3 bucket for Audit Manager Assessment Reports
        const s3Bucket = new s3.Bucket(this, 'AuditManagerS3Bucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });


        /*
        /////////////////////////////////////////////////////////////////////

            B - Create Assessment on Audit Manager

        //////////////////////////////////////////////////////////////////////
        */


        // Define an IAM role for Audit Manager
        const auditManagerRole = new iam.Role(this, 'AuditManagerRole', {
            assumedBy: new iam.ServicePrincipal('auditmanager.amazonaws.com'),
        });

        // Attach necessary permissions policies to the IAM role
        auditManagerRole.addToPolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject', 's3:GetObject'], 
            resources: [s3Bucket.bucketArn + '/*'],
        }));

        // Create the Audit Manager Assessment using the S3 bucket and IAM role
        new auditmanager.CfnAssessment(this, 'MyAuditManagerAssessment', {
            assessmentReportsDestination: {
                destination: `s3://${s3Bucket.bucketName}/report`,
                destinationType: 'S3',
            },
            frameworkId: 'c9bed0e0-ac88-35c7-bc64-61ea073dce0c', // Framework ID for PCI-DSS
            roles: [{ roleArn: auditManagerRole.roleArn, roleType: 'PROCESS_OWNER' }],
            name: 'MyAuditManagerAssessment',
            scope: {
                awsAccounts: [{
                    id: currentAccountId
                }],
                awsServices: [{
                    serviceName: 'securityhub'
                }]
            }
        });


        /*
        /////////////////////////////////////////////////////////////////////

            C - Conformance Packs configuration on AWS Config

        //////////////////////////////////////////////////////////////////////
        */

        // Attach necessary permissions policies to the IAM role
        const iamRole = new iam.Role(this, 'MyIAMRole', {
            assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
        });

        const configPolicy = new iam.PolicyStatement()

        configPolicy.addActions(
            'config:Put*',
            'config:Deliver*',
            'config:Get*',
            
        );
        configPolicy.addResources('*'); 

        iamRole.addToPolicy(configPolicy);



        // Upload PCI-DSS template to created S3
        const fileName = 'Operational-Best-Practices-for-PCI-DSS.yaml'

        const s3_prefix = `pci_yml`

        const localFilePath = path.join(__dirname, `assets/${fileName}`);

        new s3deploy.BucketDeployment(this, 'DeployYamlToS3', {
            sources: [s3deploy.Source.asset(path.dirname(localFilePath))],
            destinationBucket: s3Bucket,
            destinationKeyPrefix: s3_prefix
        });


        // Enable configuration Recorder on AWS config
        new awsconfig.CfnConfigurationRecorder(this, 'MyConfigRecorder', {
            roleArn: iamRole.roleArn,
            recordingGroup: {
                allSupported: true,
                includeGlobalResourceTypes: true,
            },
        });

        // // new awsconfig.CfnDeliveryChannel(this, 'MyConfigAggregator', {
        // //     s3BucketName: s3Bucket.bucketName
        // // });

        // Configure Conformance pack 
        new awsconfig.CfnConformancePack(this, 'MyCfnConformancePack', {
            conformancePackName: 'conformancePackName',
            deliveryS3Bucket: s3Bucket.bucketName,
            deliveryS3KeyPrefix: s3_prefix,
            templateS3Uri: `s3://${s3Bucket.bucketName}/${s3_prefix}/${fileName}`
        });

    }
}
