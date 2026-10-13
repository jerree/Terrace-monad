// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title RuleRegistry
/// @notice Stores feed ranking rules as weights (never code). Anyone can publish a rule.
/// @dev Rule ids are 1-based; id 0 is never valid. Rules are immutable once published.
contract RuleRegistry {
    struct Rule {
        address author;
        uint16 wRecency; // basis points
        uint16 wTips; // basis points
        uint16 wBackers; // basis points
        uint64 createdAt;
        string name;
    }

    /// @notice The three weights must add up to exactly this value (100.00%).
    uint256 public constant TOTAL_WEIGHT = 10_000;
    uint256 public constant MAX_NAME_LENGTH = 64; // bytes

    error EmptyName();
    error NameTooLong(uint256 length);
    error WeightsMustSumTo10000(uint256 sum);
    error InvalidRuleId(uint256 ruleId);

    event RulePublished(
        uint256 indexed ruleId, address indexed author, string name, uint16 wRecency, uint16 wTips, uint16 wBackers
    );

    /// @notice Number of rules published; also the id of the newest rule.
    uint256 public ruleCount;

    mapping(uint256 ruleId => Rule) private _rules;

    function publishRule(string calldata name, uint16 wRecency, uint16 wTips, uint16 wBackers)
        external
        returns (uint256 ruleId)
    {
        uint256 len = bytes(name).length;
        if (len == 0) revert EmptyName();
        if (len > MAX_NAME_LENGTH) revert NameTooLong(len);

        // Widen before adding so uint16 arithmetic can never wrap or panic.
        uint256 sum = uint256(wRecency) + uint256(wTips) + uint256(wBackers);
        if (sum != TOTAL_WEIGHT) revert WeightsMustSumTo10000(sum);

        ruleId = ++ruleCount;
        _rules[ruleId] = Rule({
            author: msg.sender,
            wRecency: wRecency,
            wTips: wTips,
            wBackers: wBackers,
            createdAt: uint64(block.timestamp),
            name: name
        });

        emit RulePublished(ruleId, msg.sender, name, wRecency, wTips, wBackers);
    }

    function getRule(uint256 ruleId) external view returns (Rule memory) {
        _requireValid(ruleId);
        return _rules[ruleId];
    }

    /// @notice Cheap author lookup used by Feed when splitting tips. Reverts on a bad id.
    function ruleAuthor(uint256 ruleId) external view returns (address) {
        _requireValid(ruleId);
        return _rules[ruleId].author;
    }

    function _requireValid(uint256 ruleId) private view {
        if (ruleId == 0 || ruleId > ruleCount) revert InvalidRuleId(ruleId);
    }
}
