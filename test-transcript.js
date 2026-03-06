const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function main() {
    const orgDir = '/home/boot/fabric-workspace/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com';
    const certPath = path.join(orgDir, 'users/User1@org2.example.com/msp/signcerts/cert.pem');
    const keyPath = path.join(orgDir, 'users/User1@org2.example.com/msp/keystore');
    const keyFile = fs.readdirSync(keyPath)[0];
    const key = fs.readFileSync(path.join(keyPath, keyFile));
    const cert = fs.readFileSync(certPath);

    const tlsCertPath = path.join(orgDir, 'peers/peer0.org2.example.com/tls/ca.crt');
    const tlsRootCert = fs.readFileSync(tlsCertPath);

    const credentials = grpc.credentials.createSsl(tlsRootCert);
    const client = new grpc.Client('localhost:9051', credentials, { 'grpc.ssl_target_name_override': 'peer0.org2.example.com' });

    const gateway = connect({
        client,
        identity: { mspId: 'Org2MSP', credentials: cert },
        signer: signers.newPrivateKeySigner(crypto.createPrivateKey(key))
    });

    try {
        const network = gateway.getNetwork('mychannel');
        const contract = network.getContract('basic', 'TranscriptContract');

        console.log("Submitting CreateTranscript...");
        await contract.submitTransaction('CreateTranscript', 'diag-002', 'Student1', '15', 'hash123', '2023-01-01');
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
