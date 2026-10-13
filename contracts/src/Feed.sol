// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IRuleRegistry {
    /// @dev Must revert for an unknown rule id.
    function ruleAuthor(uint256 ruleId) external view returns (address);
}

/// @title Feed
/// @notice Posts and tips. A tip is split between the post author and the author of the
///         rule the tipper was viewing. Funds are credited on tip and pulled with withdraw().
/// @dev Native-token tips only. No owner, no admin, no upgrade path, no fee to the deployer.
///      Ids are 1-based; id 0 is never valid.
contract Feed {
    struct Post {
        address author;
        uint64 createdAt;
        uint32 backerCount; // unique tippers, a ranking input for wBackers
        uint256 totalTips; // wei, a ranking input for wTips
        string text;
    }

    /// @notice Rule author's share of every tip, in basis points (10%).
    uint256 public constant RULE_AUTHOR_BPS = 1_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_TEXT_LENGTH = 500; // bytes

    IRuleRegistry public immutable registry;

    error EmptyText();
    error TextTooLong(uint256 length);
    error InvalidPostId(uint256 postId);
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();
    error ZeroAddress();
    error TipTooLow();

    event PostCreated(
        uint256 indexed postId,
        address indexed author,
        string text
    );
    event Tipped(
        uint256 indexed postId,
        address indexed tipper,
        uint256 indexed ruleId,
        uint256 amount
    );
    event Withdrawn(address indexed account, uint256 amount);

    uint256 public postCount;

    mapping(uint256 postId => Post) private _posts;
    mapping(uint256 postId => mapping(address tipper => bool))
        private _hasTipped;
    mapping(address account => uint256) private _pending;

    uint256 private _lock = 1; // 1 = unlocked, 2 = locked

    // consider using openzeppelin own reentrant libraries
    modifier nonReentrant() {
        if (_lock == 2) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _registry) {
        if (_registry == address(0)) revert ZeroAddress();
        registry = IRuleRegistry(_registry);
    }

    function createPost(
        string calldata text
    ) external returns (uint256 postId) {
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > MAX_TEXT_LENGTH) revert TextTooLong(len);

        postId = ++postCount;
        _posts[postId] = Post({
            author: msg.sender,
            createdAt: uint64(block.timestamp),
            backerCount: 0,
            totalTips: 0,
            text: text
        });

        emit PostCreated(postId, msg.sender, text);
    }

    /// @notice Tip a post. msg.value is split: rule author gets RULE_AUTHOR_BPS, post author the rest.
    /// @dev The rule author's share is rounded down and the post author takes the remainder,
    ///      so the two credits always add up to msg.value exactly. No value leaves the contract
    ///      here; payouts only happen in withdraw().
    function tip(uint256 postId, uint256 ruleId) external payable {
        uint256 MIN_TIP = 10 ** 16; // 0.01 MON (18 decimals)
        if (msg.value < MIN_TIP) revert TipTooLow();
        Post storage post = _getPost(postId);
        address ruleAuthor = registry.ruleAuthor(ruleId); // reverts on a bad ruleId

        uint256 ruleShare = (msg.value * RULE_AUTHOR_BPS) / BPS_DENOMINATOR;
        uint256 postShare = msg.value - ruleShare;

        post.totalTips += msg.value;
        if (!_hasTipped[postId][msg.sender]) {
            _hasTipped[postId][msg.sender] = true;
            post.backerCount += 1;
        }

        _pending[post.author] += postShare;
        _pending[ruleAuthor] += ruleShare;

        emit Tipped(postId, msg.sender, ruleId, msg.value);
    }

    /// @notice Pull your accumulated earnings (post-author and rule-author shares together).
    function withdraw() external nonReentrant {
        uint256 amount = _pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        _pending[msg.sender] = 0; // effects before interaction

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    function getPost(uint256 postId) external view returns (Post memory) {
        return _getPost(postId);
    }

    function pendingBalance(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _pending[account];
    }

    function _getPost(uint256 postId) private view returns (Post storage) {
        if (postId == 0 || postId > postCount) revert InvalidPostId(postId);
        return _posts[postId];
    }
}
