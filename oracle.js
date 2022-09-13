const { utils } = require('@aeternity/aeproject');
const {AeSdk, Node, MemoryAccount, generateKeyPair} = require('@aeternity/aepp-sdk');
const fs = require('fs');
const path = require('path');

const oracleTtl = {type: 'delta', value: 800}
const ACI_SOURCE = './aci/GalacticWar.json';
const gwAci = utils.getContractContent(ACI_SOURCE);
const url = 'https://testnet.aeternity.io/';

const INTERNAL_AUTH_KEY = process.env.IEAUTH_KEY

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

let oracle_id = "ok_2ZQ8Ytkuf7g8sERU5wTpUNVTPcFYmTxy4vYoY7GsJVuaH81eaD";
const gwContractAddress = "ct_wFXTjNu92fWVcrLVP6WBbH4eiZUBrZqJaNFsKFMQKeDi1pK6t";

const startOracle = async () => {
    let aeSdk = await init()
    console.log(`Starting Oracle`)
    let galacticWarContract = await aeSdk.getContractInstance({
        aci: JSON.parse(gwAci),
        contractAddress: gwContractAddress,
      });

    let myAddress =  await aeSdk.address();
    let oracleDelegationSig = await aeSdk.createOracleDelegationSignature(galacticWarContract.deployInfo.address);
    if(oracle_id===""){
        oracle_id = (await galacticWarContract.methods.register_oracle(oracleDelegationSig, myAddress, 60, { RelativeTTL: [oracleTtl.value] })).decodedResult;
    }
    console.log(`Oracle Id: ${oracle_id}`)

    let oracle = await aeSdk.getOracleObject(oracle_id) 

    setInterval(async () => {
        try{
            const height = await aeSdk.height();
            if (height > (oracle.ttl - (oracleTtl.value / 2))) {
                let oracleDelegationSig = await aeSdk.createOracleDelegationSignature(galacticWarContract.deployInfo.address);
                await galacticWarContract.methods.extend_oracle(oracleDelegationSig, { RelativeTTL: [oracleTtl.value] });
                oracle = await aeSdk.getOracleObject(oracle_id) 
                console.log("extended oracle at height:", height, "new ttl:", oracle.ttl);
            }
        }catch(e){
            console.error(e)
        }
    }, 5000)

    await oracle.pollQueries(async (queries) => {
        //console.log(queries.length)
        for(let x of queries){
            console.log(x)
            let gameId = decode(x.query).toString('ascii')
            let queryId = x.id;
            let game_data = await fetch(`http://127.0.0.1:3000/api/anticheat/game_engine/get_data/${gameId}`, {
                headers:{
                    Auth: INTERNAL_AUTH_KEY
                }
            })
            if(game_data.sucess){
                try{
                    const oracleRespondSig = await aeSdk.createOracleDelegationSignature(galacticWarContract.deployInfo.address, {queryId})
                    await galacticWarContract.methods.respond_query(oracleRespondSig, queryId, { "game_id":  gameId, "destroyed_building": game_data['buildings'], "killed_troops": game_data['troops'] })
                }catch(e){
                    console.error(e)
                }
            }
        }
    }, { interval: 1000 })
}

startOracle()