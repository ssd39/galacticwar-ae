const { assert } = require('chai');
const fs = require('fs');
const path = require('path');
const { utils } = require('@aeternity/aeproject');
const { encode , Encoding, ORACLE_TTL_TYPES} = require('@aeternity/aepp-sdk')
const  mlog = require('mocha-logger');
const Timeout = require('await-timeout')

const GW_CONTRACT_SOURCE = './contracts/GalacticWar.aes';
const GA_CONTRACT_SOURCE = './contracts/GameAsset.aes';
const AU_CONTRACT_SOURCE = './contracts/Aureus.aes';

describe('GalacticWar', () => {
  let aeSdk;
  let galacticWarContract;
  let gaSource;
  let auSource;

  before(async () => {
    aeSdk = await utils.getSdk();

    // a filesystem object must be passed to the compiler if the contract uses custom includes
    const gwfileSystem = utils.getFilesystem(GW_CONTRACT_SOURCE);

    // get content of contract
    const gwSource = utils.getContractContent(GW_CONTRACT_SOURCE);
    gaSource = utils.getContractContent(GA_CONTRACT_SOURCE);
    auSource = utils.getContractContent(AU_CONTRACT_SOURCE);

    // initialize the contract instance
    galacticWarContract = await aeSdk.getContractInstance({ source: gwSource, fileSystem: gwfileSystem });
    await galacticWarContract.deploy();
    
    const aci_path = path.resolve(__dirname, "../aci/GalacticWar.json");
    fs.writeFileSync(aci_path,JSON.stringify(galacticWarContract._aci))
    
    mlog.log(`GalacticWar: address = ${galacticWarContract.deployInfo.address} `);

    // create a snapshot of the blockchain state
    await utils.createSnapshot(aeSdk);
  });

  // after each test roll back to initial state
  afterEach(async () => {
    await utils.rollbackSnapshot(aeSdk);
  });

  it('GalacticWar: add_asset and mint', async () => {
    let deployed_contract = await galacticWarContract.methods.add_asset('test', 'tst', 'test' , 2000, { onAccount: utils.getDefaultAccounts()[0] });

    mlog.log(`DeployedAsset: name = ${'test'}, address = ${deployed_contract.decodedResult.replace("ak_", "ct_")} `);

    const assets_count = await galacticWarContract.methods.get_total_assets({ onAccount: utils.getDefaultAccounts()[0] });
    assert.equal(assets_count.decodedResult, 3);

    let myAddress =  await (utils.getDefaultAccounts()[0].address());
    await galacticWarContract.methods.mint(2, myAddress, { onAccount: utils.getDefaultAccounts()[0] });

    let aurues_address = await galacticWarContract.methods.get_aureus_address({ onAccount: utils.getDefaultAccounts()[0] })
    let auruesAssetContract = await aeSdk.getContractInstance({ source: auSource, contractAddress:  aurues_address.decodedResult.replace("ak_", "ct_")});
    let aurues_count = await auruesAssetContract.methods.balance(myAddress, { onAccount: utils.getDefaultAccounts()[0] })
    assert.equal(aurues_count.decodedResult, 8000);

    let gameAssetContract = await aeSdk.getContractInstance({ source: gaSource, contractAddress:  deployed_contract.decodedResult.replace("ak_", "ct_")});
    let asset_owner = await gameAssetContract.methods.owner_of(0, { onAccount: utils.getDefaultAccounts()[0] });
    assert.equal(asset_owner.decodedResult, myAddress);
  });

  it('GalacticWar: start game', async () => {
    let myAddress =  await (utils.getDefaultAccounts()[0].address());

    await galacticWarContract.methods.start_game();
    mlog.log(`Game Started`);
    let is_game_started = await galacticWarContract.methods.is_game_started({ onAccount: utils.getDefaultAccounts()[0] });
    assert(is_game_started.decodedResult==true)

    let town_hall_address = await galacticWarContract.methods.get_asset_address(0, { onAccount: utils.getDefaultAccounts()[0] })
    let miner_address = await galacticWarContract.methods.get_asset_address(1, { onAccount: utils.getDefaultAccounts()[0] })
    let aurues_address = await galacticWarContract.methods.get_aureus_address({ onAccount: utils.getDefaultAccounts()[0] })
    
    let townHallContract = await aeSdk.getContractInstance({ source: gaSource, contractAddress:  town_hall_address.decodedResult.replace("ak_", "ct_")});
    let minerContract = await aeSdk.getContractInstance({ source: gaSource, contractAddress:  miner_address.decodedResult.replace("ak_", "ct_")});
    let auruesAssetContract = await aeSdk.getContractInstance({ source: auSource, contractAddress:  aurues_address.decodedResult.replace("ak_", "ct_")});

    mlog.log(`Checking aurues`);
    let aurues_count = await auruesAssetContract.methods.balance(myAddress, { onAccount: utils.getDefaultAccounts()[0] })
    assert(aurues_count.decodedResult>=12000)
    mlog.log(`Checking town hall`);
    let townhall_count = await townHallContract.methods.balance_of(myAddress, { onAccount: utils.getDefaultAccounts()[0] })
    assert(townhall_count.decodedResult==1)
    mlog.log(`Checking miner`);
    let miner_count = await minerContract.methods.balance_of(myAddress, { onAccount: utils.getDefaultAccounts()[0] })
    assert(miner_count.decodedResult>=0)
  });

  it('GalacticWar: update building cordinates', async () => {
    let myAddress =  await (utils.getDefaultAccounts()[0].address());
    await galacticWarContract.methods.start_game({ onAccount: utils.getDefaultAccounts()[0] });
    mlog.log(`Game Started`);
    mlog.log(`Updateing cordinates`);
    await galacticWarContract.methods.update_building_cordinates({0: [[10,20]]},  { onAccount: utils.getDefaultAccounts()[0] });
    let building_data = await galacticWarContract.methods.get_buildings_data(myAddress, { onAccount: utils.getDefaultAccounts()[0] })
  })

  it('GalacticWar: start war & end war', async () => {
    let myAddress =  await (utils.getDefaultAccounts()[1].address());
    const oracleTtl = {type: 'delta', value: 4000, onAccount: utils.getDefaultAccounts()[1]}

    let oracleDelegationSig = await aeSdk.createOracleDelegationSignature(galacticWarContract.deployInfo.address, { onAccount: utils.getDefaultAccounts()[1] });
    const oracle_id = (await galacticWarContract.methods.register_oracle(oracleDelegationSig, myAddress, 50, 4000)).decodedResult;
    mlog.log(`Oracle Id: ${oracle_id}`)

    let oracle = await aeSdk.getOracleObject(oracle_id, { onAccount: utils.getDefaultAccounts()[1] }) 
    const extendedOracle = await aeSdk.extendOracleTtl(oracle_id, oracleTtl)
    mlog.log(`Oracle Resgistered`)
    
    
    await galacticWarContract.methods.start_game({ onAccount: utils.getDefaultAccounts()[0] });
    for(let i=1; i<=10; i++){
      await galacticWarContract.methods.start_game({ onAccount: utils.getDefaultAccounts()[i] });
      await galacticWarContract.methods.update_building_cordinates({0: [[i,20]]},  { onAccount: utils.getDefaultAccounts()[i] });
    }
    mlog.log(`Game Started`);
    mlog.log(`Updateing cordinates`);
    await galacticWarContract.methods.update_building_cordinates({0: [[10,20]]},  { onAccount: utils.getDefaultAccounts()[0] });
    await galacticWarContract.methods.update_building_cordinates({0: [[40,50]]},  { onAccount: utils.getDefaultAccounts()[1] });    
    let war_details = await galacticWarContract.methods.start_war({ onAccount: utils.getDefaultAccounts()[0] });
    mlog.log(`Game Id: ${war_details.decodedResult[0]}`)
    await galacticWarContract.methods.end_war(war_details.decodedResult[0],{ onAccount: utils.getDefaultAccounts()[0], amount: 70 })
    clearInterval(extendOracle)
  })

});
