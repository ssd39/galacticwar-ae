const {AeSdk, Node, MemoryAccount, generateKeyPair,} = require('@aeternity/aepp-sdk');
const { utils } = require('@aeternity/aeproject');
const readline = require('readline');

const fs = require('fs');
const path = require('path');

const GW_CONTRACT_SOURCE = './contracts/GalacticWar.aes';
const GA_CONTRACT_SOURCE = './contracts/GameAsset.aes';
const AU_CONTRACT_SOURCE = './contracts/Aureus.aes';

// a filesystem object must be passed to the compiler if the contract uses custom includes
const gwfileSystem = utils.getFilesystem(GW_CONTRACT_SOURCE);

// get content of contract
const gwSource = utils.getContractContent(GW_CONTRACT_SOURCE);
const gaSource = utils.getContractContent(GA_CONTRACT_SOURCE);
const auSource = utils.getContractContent(AU_CONTRACT_SOURCE);

const url = 'https://testnet.aeternity.io/';

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}


const getKeyPair = (location) => {
    const keypairFile = path.resolve(__dirname, location);
    const persisted = fs.existsSync(keypairFile);
    if (persisted) {
      return JSON.parse(fs.readFileSync(keypairFile), "utf-8");
    } else {
      const keypair = generateKeyPair();
      fs.writeFileSync(keypairFile, JSON.stringify(keypair), "utf-8");
      return keypair;
    }
};

const init = async () => {
    let keypair = getKeyPair("../wallet/keystore.json");
    let client = new AeSdk({
    compilerUrl: "https://latest.compiler.aepps.com",
    nodes: [
        {
        name: 'node',
        instance: new Node(process.env.NODE_URL || url),
        }]
    });
    await client.addAccount(new MemoryAccount({ keypair: keypair }), { select: true })
    
    return client;
}

let galacticWarContract;
let aeSdk;

const deploy = async () =>{
    aeSdk = await init()
    askQuestion(`Address: ${await aeSdk.address()}: \nHit Enter to continue.`)
    galacticWarContract = await aeSdk.getContractInstance({ source: gwSource, fileSystem: gwfileSystem });
    await galacticWarContract.deploy()
    console.log(`GalacticWar: ${galacticWarContract.deployInfo.address}`)
}

deploy()
