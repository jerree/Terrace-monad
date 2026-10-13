// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {RuleRegistry} from "../src/RuleRegistry.sol";
import {Feed} from "../src/Feed.sol";

/// @dev Tries to re-enter withdraw() from its receive hook and records whether that worked.
contract ReentrantWithdrawer {
    Feed public immutable feed;
    bool public attempted;
    bool public reentered;

    constructor(Feed f) {
        feed = f;
    }

    function post() external returns (uint256) {
        return feed.createPost("attacker post");
    }

    function attack() external {
        feed.withdraw();
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            try feed.withdraw() {
                reentered = true;
            } catch {}
        }
    }
}

/// @dev Author whose address cannot receive native tokens.
contract RejectsEth {
    Feed public immutable feed;

    constructor(Feed f) {
        feed = f;
    }

    function post() external returns (uint256) {
        return feed.createPost("cannot be paid");
    }

    function pull() external {
        feed.withdraw();
    }
}

contract FeedTest is Test {
    RuleRegistry registry;
    Feed feed;

    address alice = makeAddr("alice"); // post author
    address bob = makeAddr("bob"); // rule author
    address carol = makeAddr("carol"); // tipper
    address dave = makeAddr("dave"); // second tipper

    uint256 internal constant MIN_TIP = 0.01 ether; // must match Feed.tip's minimum

    uint256 postId;
    uint256 ruleId;

    function setUp() public {
        registry = new RuleRegistry();
        feed = new Feed(address(registry));

        vm.prank(bob);
        ruleId = registry.publishRule("Most tipped", 1000, 7000, 2000);

        vm.prank(alice);
        postId = feed.createPost("hello monad");

        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
    }

    // ---------------------------------------------------------------- constructor

    function test_constructor_rejectsZeroRegistry() public {
        vm.expectRevert(Feed.ZeroAddress.selector);
        new Feed(address(0));
    }

    // ---------------------------------------------------------------- posts

    function test_createPost_storesAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit Feed.PostCreated(2, carol, "second");

        vm.warp(5_000);
        vm.prank(carol);
        uint256 id = feed.createPost("second");

        assertEq(id, 2);
        assertEq(feed.postCount(), 2);

        Feed.Post memory p = feed.getPost(2);
        assertEq(p.author, carol);
        assertEq(p.text, "second");
        assertEq(p.createdAt, 5_000);
        assertEq(p.totalTips, 0);
        assertEq(p.backerCount, 0);
    }

    function test_createPost_reverts() public {
        vm.expectRevert(Feed.EmptyText.selector);
        feed.createPost("");

        vm.expectRevert(abi.encodeWithSelector(Feed.TextTooLong.selector, 501));
        feed.createPost(string(new bytes(501)));
    }

    function test_createPost_maxLengthOk() public {
        feed.createPost(string(new bytes(500)));
        assertEq(feed.postCount(), 2);
    }

    // ---------------------------------------------------------------- tipping and split

    function test_tip_splits90_10() public {
        vm.expectEmit(true, true, true, true);
        emit Feed.Tipped(postId, carol, ruleId, 1 ether);

        vm.prank(carol);
        feed.tip{value: 1 ether}(postId, ruleId);

        assertEq(feed.pendingBalance(alice), 0.9 ether);
        assertEq(feed.pendingBalance(bob), 0.1 ether);
        assertEq(address(feed).balance, 1 ether);
    }

    function test_tip_minTip_splits90_10() public {
        vm.prank(carol);
        feed.tip{value: MIN_TIP}(postId, ruleId);

        assertEq(feed.pendingBalance(bob), 0.001 ether);
        assertEq(feed.pendingBalance(alice), 0.009 ether);
    }

    function test_tip_oddAmountStaysExact() public {
        uint256 amount = 12_345_678_901_234_567; // above MIN_TIP, not divisible by 10
        vm.prank(carol);
        feed.tip{value: amount}(postId, ruleId);

        uint256 ruleShare = (amount * 1_000) / 10_000; // rounded down
        assertEq(feed.pendingBalance(bob), ruleShare);
        assertEq(feed.pendingBalance(alice), amount - ruleShare);
    }

    function testFuzz_splitIsExact(uint96 amount) public {
        amount = uint96(bound(amount, MIN_TIP, 50 ether));

        vm.prank(carol);
        feed.tip{value: amount}(postId, ruleId);

        uint256 a = feed.pendingBalance(alice);
        uint256 b = feed.pendingBalance(bob);
        assertEq(a + b, amount);
        assertEq(b, (uint256(amount) * 1_000) / 10_000);
    }

    function test_tip_sameAuthorForPostAndRuleGetsBoth() public {
        vm.prank(alice);
        uint256 ownRule = registry.publishRule("mine", 3000, 3000, 4000);

        vm.prank(carol);
        feed.tip{value: 1 ether}(postId, ownRule);

        assertEq(feed.pendingBalance(alice), 1 ether);
    }

    function test_tip_updatesRankingInputs() public {
        vm.prank(carol);
        feed.tip{value: 1 ether}(postId, ruleId);
        vm.prank(carol);
        feed.tip{value: 2 ether}(postId, ruleId); // same backer again
        vm.prank(dave);
        feed.tip{value: 3 ether}(postId, ruleId);

        Feed.Post memory p = feed.getPost(postId);
        assertEq(p.totalTips, 6 ether);
        assertEq(p.backerCount, 2);
    }

    function test_tip_revertsOnBadIdsAndLowValue() public {
        vm.startPrank(carol);

        vm.expectRevert(abi.encodeWithSelector(Feed.InvalidPostId.selector, 0));
        feed.tip{value: MIN_TIP}(0, ruleId);

        vm.expectRevert(abi.encodeWithSelector(Feed.InvalidPostId.selector, 2));
        feed.tip{value: MIN_TIP}(2, ruleId);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.InvalidRuleId.selector, 0));
        feed.tip{value: MIN_TIP}(postId, 0);

        vm.expectRevert(abi.encodeWithSelector(RuleRegistry.InvalidRuleId.selector, 2));
        feed.tip{value: MIN_TIP}(postId, 2);

        vm.expectRevert(Feed.TipTooLow.selector);
        feed.tip{value: 0}(postId, ruleId);

        vm.expectRevert(Feed.TipTooLow.selector);
        feed.tip{value: MIN_TIP - 1}(postId, ruleId);

        vm.stopPrank();
    }

    function test_plainEthTransfersRejected() public {
        vm.prank(carol);
        (bool ok,) = address(feed).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(feed).balance, 0);
    }

    // ---------------------------------------------------------------- withdraw

    function test_withdraw_paysAndZeroesBalance() public {
        vm.prank(carol);
        feed.tip{value: 1 ether}(postId, ruleId);

        uint256 before = alice.balance;

        vm.expectEmit(true, false, false, true);
        emit Feed.Withdrawn(alice, 0.9 ether);

        vm.prank(alice);
        feed.withdraw();

        assertEq(alice.balance - before, 0.9 ether);
        assertEq(feed.pendingBalance(alice), 0);
        assertEq(feed.pendingBalance(bob), 0.1 ether); // untouched

        vm.prank(alice);
        vm.expectRevert(Feed.NothingToWithdraw.selector);
        feed.withdraw();
    }

    function test_withdraw_revertsWhenNothingOwed() public {
        vm.prank(carol);
        vm.expectRevert(Feed.NothingToWithdraw.selector);
        feed.withdraw();
    }

    function test_withdraw_reentrancyBlocked() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(feed);
        uint256 attackerPost = attacker.post();

        vm.prank(carol);
        feed.tip{value: 1 ether}(attackerPost, ruleId);
        // Extra funds owed to others, so a double-pay would be visible.
        vm.prank(dave);
        feed.tip{value: 5 ether}(postId, ruleId);

        attacker.attack();

        assertTrue(attacker.attempted());
        assertFalse(attacker.reentered());
        assertEq(address(attacker).balance, 0.9 ether); // paid exactly once
        assertEq(feed.pendingBalance(address(attacker)), 0);
        assertEq(address(feed).balance, 6 ether - 0.9 ether);
    }

    function test_withdraw_failedTransferKeepsCredit() public {
        RejectsEth bad = new RejectsEth(feed);
        uint256 badPost = bad.post();

        vm.prank(carol);
        feed.tip{value: 1 ether}(badPost, ruleId);

        vm.expectRevert(Feed.TransferFailed.selector);
        bad.pull();

        assertEq(feed.pendingBalance(address(bad)), 0.9 ether); // state rolled back, funds not lost
    }

    // ---------------------------------------------------------------- solvency

    /// @dev Whatever mix of tips and withdrawals happens, the contract holds exactly what it owes.
    function testFuzz_balanceAlwaysEqualsSumOfPending(uint96 t1, uint96 t2, uint96 t3, bool w1, bool w2) public {
        t1 = uint96(bound(t1, MIN_TIP, 10 ether));
        t2 = uint96(bound(t2, MIN_TIP, 10 ether));
        t3 = uint96(bound(t3, MIN_TIP, 10 ether));

        vm.prank(carol);
        feed.tip{value: t1}(postId, ruleId);
        vm.prank(dave);
        feed.tip{value: t2}(postId, ruleId);

        if (w1) {
            vm.prank(alice);
            feed.withdraw();
        }

        vm.prank(carol);
        feed.tip{value: t3}(postId, ruleId);

        if (w2) {
            vm.prank(bob);
            feed.withdraw();
        }

        assertEq(address(feed).balance, feed.pendingBalance(alice) + feed.pendingBalance(bob));
    }
}
