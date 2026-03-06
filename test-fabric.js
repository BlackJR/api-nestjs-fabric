const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function main() {
    const org1Dir = '/home/boot/fabric-workspace/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com';
    const certPath = path.join(org1Dir, 'users/User1@org1.example.com/msp/signcerts/cert.pem');
    const keyPath = path.join(org1Dir, 'users/User1@org1.example.com/msp/keystore');
    const keyFile = fs.readdirSync(keyPath)[0];
    const key = fs.readFileSync(path.join(keyPath, keyFile));
    const cert = fs.readFileSync(certPath);

    const tlsCertPath = path.join(org1Dir, 'peers/peer0.org1.example.com/tls/ca.crt');
    const tlsRootCert = fs.readFileSync(tlsCertPath);

    const credentials = grpc.credentials.createSsl(tlsRootCert);
    const client = new grpc.Client('localhost:7051', credentials, { 'grpc.ssl_target_name_override': 'peer0.org1.example.com' });

    const gateway = connect({
        client,
        identity: { mspId: 'Org1MSP', credentials: cert },
        signer: signers.newPrivateKeySigner(crypto.createPrivateKey(key))
    });

    try {
        const network = gateway.getNetwork('mychannel');
        const contract = network.getContract('basic');

        console.log("Submitting CreateDiploma...");
        await contract.submitTransaction('CreateDiploma', 'diag-001', 'TestName', 'TestSchool', 'FakeHash123');
        console.log("Success!");
    } catch (error) {
        console.error("Error:", error);
        if (error.details) console.log("Details:", JSON.stringify(error.details, null, 2));
    } finally {
        gateway.close();
        client.close();
    }
}
main();
