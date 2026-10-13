// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RuleRegistry} from "../src/RuleRegistry.sol";

contract RuleRegistryTest is Test {
    RuleRegistry registry;
    address bob = makeAddr("bob");

    function setUp() public {
        registry = new RuleRegistry();
    }

    function test_publishRule_storesAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit RuleRegistry.RulePublished(1, bob, "Fresh first", 7000, 1500, 1500);

        vm.warp(1_000);
        vm.prank(bob);
        uint256 id = registry.publishRule("Fresh first", 7000, 1500, 1500);

        assertEq(id, 1);
        assertEq(registry.ruleCount(), 1);

        RuleRegistry.Rule memory r = registry.getRule(1);
        assertEq(r.author, bob);
        assertEq(r.name, "Fresh first");
        assertEq(r.wRecency, 7000);
        assertEq(r.wTips, 1500);
        assertEq(r.wBackers, 1500);
        assertEq(r.createdAt, 1_000);
        assertEq(registry.ruleAuthor(1), bob);
    }

    function test_idsIncrement() public {
        assertEq(registry.publishRule("a", 10_000, 0, 0), 1);
        assertEq(registry.publishRule("b", 0, 10_000, 0), 2);
        assertEq(registry.publishRule("c", 0, 0, 10_000), 3);
        assertEq(registry.ruleCount(), 3);
    }

    function test_revert_weightsNotSummingTo10000() public {
        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.WeightsMustSumTo10000.selector, 9_999));
        registry.publishRule("x", 5000, 2500, 2499);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.WeightsMustSumTo10000.selector, 10_001));
        registry.publishRule("x", 5000, 2500, 2501);
    }

    function test_revert_weightsThatWouldOverflowUint16() public {
        // 3 * 65535 would wrap a uint16 sum; the widened sum must revert cleanly instead.
        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.WeightsMustSumTo10000.selector, uint256(3) * 65_535));
        registry.publishRule("x", 65_535, 65_535, 65_535);
    }

    function test_revert_emptyName() public {
        vm.expectRevert(RuleRegistry.EmptyName.selector);
        registry.publishRule("", 10_000, 0, 0);
    }

    function test_revert_nameTooLong() public {
        string memory long = string(new bytes(65));
        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.NameTooLong.selector, 65));
        registry.publishRule(long, 10_000, 0, 0);
    }

    function test_nameAtMaxLengthOk() public {
        registry.publishRule(string(new bytes(64)), 10_000, 0, 0);
        assertEq(registry.ruleCount(), 1);
    }

    function test_revert_badIds() public {
        registry.publishRule("a", 10_000, 0, 0);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.InvalidRuleId.selector, 0));
        registry.getRule(0);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.InvalidRuleId.selector, 2));
        registry.getRule(2);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.InvalidRuleId.selector, 2));
        registry.ruleAuthor(2);
    }

    function testFuzz_anyValidWeightsAccepted(uint16 a, uint16 b) public {
        a = uint16(bound(a, 0, 10_000));
        b = uint16(bound(b, 0, 10_000 - a));
        uint16 c = uint16(10_000 - a - b);
        uint256 id = registry.publishRule("fuzz", a, b, c);
        RuleRegistry.Rule memory r = registry.getRule(id);
        assertEq(uint256(r.wRecency) + r.wTips + r.wBackers, 10_000);
    }
}
