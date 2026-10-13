// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RuleRegistry} from "../src/RuleRegistry.sol";
import {Feed} from "../src/Feed.sol";

/// Seeds demo data so the frontend and demo video have something to show.
///forge script script/Seed.s.sol:Seed --rpc-url monad_testnet --account deployer --broadcast
/// Reads addresses from deployments/<chainId>.json written by Deploy, or accepts them via CLI args.
contract Seed is Script {
    // Demo tippers use publicly derivable keys. TESTNET ONLY, never put real value on them.
    uint256 internal constant TIPPERS = 3;
    uint256 internal constant FUND_EACH = 0.1 ether;
    uint256 internal constant TIP_AMOUNT = 0.01 ether;
    function run() external {
        require(
            block.chainid == 10143 || block.chainid == 31337,
            "Seed: unsupported chain"
        );

        RuleRegistry _registry = RuleRegistry(
            0x19464E21c96d011e0fd47370e404A4128fB655A0
        );
        Feed _feed = Feed(0x5dAf8F7F033d0f65F19D7D6859CdC23E5cF4ED12);

        uint256[TIPPERS] memory keys;
        address[TIPPERS] memory tippers;
        for (uint256 i = 0; i < TIPPERS; i++) {
            keys[i] = uint256(
                keccak256(abi.encodePacked("algo-marketplace-demo-tipper", i))
            );
            tippers[i] = vm.addr(keys[i]);
        }

        // 1) Deployer publishes rules, writes posts, and funds the demo tippers.
        vm.startBroadcast();
        uint256 fresh = _registry.publishRule("Fresh first", 7000, 1500, 1500);
        uint256 tipped = _registry.publishRule("Most tipped", 1000, 7000, 2000);
        uint256 community = _registry.publishRule(
            "Community backed",
            1000,
            2000,
            7000
        );

        uint256 p1 = _feed.createPost(
            "Monad finalizes so fast the feed barely has time to blink."
        );
        uint256 p2 = _feed.createPost(
            "Ranking rules should be weights, not code. Fight me."
        );
        uint256 p3 = _feed.createPost(
            "Tip the post, and the rule that surfaced it gets a cut."
        );
        uint256 p4 = _feed.createPost("Gm from the testnet.");

        for (uint256 i = 0; i < TIPPERS; i++) {
            (bool ok, ) = payable(tippers[i]).call{value: FUND_EACH}("");
            require(ok, "Seed: funding failed");
        }
        vm.stopBroadcast();

        // 2) Each demo tipper backs a different mix of posts under different rules.
        uint256[4] memory posts = [p1, p2, p3, p4];
        uint256[3] memory rules = [fresh, tipped, community];
        for (uint256 i = 0; i < TIPPERS; i++) {
            vm.startBroadcast(keys[i]);
            for (uint256 j = 0; j < posts.length; j++) {
                // Skip some pairs so backer counts differ between posts.
                if ((i + j) % 3 == 0) continue;
                _feed.tip{value: TIP_AMOUNT}(
                    posts[j],
                    rules[(i + j) % rules.length]
                );
            }
            vm.stopBroadcast();
        }

        console.log("Seeded rules:", _registry.ruleCount());
        console.log("Seeded posts:", _feed.postCount());
    }
}
