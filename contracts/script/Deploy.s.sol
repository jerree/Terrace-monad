// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {RuleRegistry} from "../src/RuleRegistry.sol";
import {Feed} from "../src/Feed.sol";

/// forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --account deployer --broadcast
contract Deploy is Script {
    uint256 internal constant MONAD_TESTNET = 10143;
    uint256 internal constant ANVIL = 31337;

    function run() external returns (RuleRegistry registry, Feed feed) {
        // Deliberately testnet/local only. Add 143 here when you mean to ship to mainnet.
        require(block.chainid == MONAD_TESTNET || block.chainid == ANVIL, "Deploy: unsupported chain");

        vm.startBroadcast(); // signer comes from --account / --ledger, never from source
        registry = new RuleRegistry();
        feed = new Feed(address(registry));
        vm.stopBroadcast();

        console.log("chainId      :", block.chainid);
        console.log("RuleRegistry :", address(registry));
        console.log("Feed         :", address(feed));

        // Only write the handoff file for a real broadcast, not for a dry-run simulation.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory json = string.concat(
                '{"chainId":',
                vm.toString(block.chainid),
                ',"rpcUrl":"https://testnet-rpc.monad.xyz","ruleRegistry":"',
                vm.toString(address(registry)),
                '","feed":"',
                vm.toString(address(feed)),
                '"}'
            );
            vm.writeFile(string.concat("deployments/", vm.toString(block.chainid), ".json"), json);
        }
    }
}
