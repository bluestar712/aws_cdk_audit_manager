const AWS = require('aws-sdk');

exports.handler = async () => {
  
  const auditmanager = new AWS.AuditManager({ region: 'us-east-1' });

  const sts = new AWS.STS();

  const kms = new AWS.KMS();

  const awsId = (await sts.getCallerIdentity().promise()).Account;

  const key = (await kms.createKey({Description: 'My KMS key'}).promise()).KeyMetadata.KeyId;

  const currentRegion = AWS.config.region;

  console.log("aws Id ====>", awsId)

  console.log("kms key ====>", key)

  console.log("current Region ===>", currentRegion)

  const kms_key = `arn:aws:kms:${currentRegion}:${awsId}:key/${key}` 

  console.log("kms_key ===>", kms_key)

  try {

    const createAuditResponse = await auditmanager.registerAccount({
      delegatedAdminAccount: awsId,
      kmsKey: kms_key
    })

    console.log('Audit manager created:', createAuditResponse);

    return {
      statusCode: 200,
      body: JSON.stringify(`Audit manager active state: ${createAuditResponse}`),
    };
  } catch (error) {
    console.error('Error creating audit manager', error);

    return {
      statusCode: 500,
      body: JSON.stringify('Error creating audit manager'),
    };
  }
};
