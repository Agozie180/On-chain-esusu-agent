// Sources flattened with hardhat v2.29.1 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/Context.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/access/Ownable.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}


// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/extensions/IERC20Permit.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/utils/Address.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/Address.sol)

pragma solidity ^0.8.20;

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error AddressInsufficientBalance(address account);

    /**
     * @dev There's no code at `target` (it is not a contract).
     */
    error AddressEmptyCode(address target);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedInnerCall();

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.20/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        if (address(this).balance < amount) {
            revert AddressInsufficientBalance(address(this));
        }

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert FailedInnerCall();
        }
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason or custom error, it is bubbled
     * up by this function (like regular Solidity function calls). However, if
     * the call reverted with no returned reason, this function reverts with a
     * {FailedInnerCall} error.
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) {
            revert AddressInsufficientBalance(address(this));
        }
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and reverts if the target
     * was not a contract or bubbling up the revert reason (falling back to {FailedInnerCall}) in case of an
     * unsuccessful call.
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata
    ) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            // only check if target is a contract if the call was successful and the return data is empty
            // otherwise we already know that it was a contract
            if (returndata.length == 0 && target.code.length == 0) {
                revert AddressEmptyCode(target);
            }
            return returndata;
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and reverts if it wasn't, either by bubbling the
     * revert reason or with a default {FailedInnerCall} error.
     */
    function verifyCallResult(bool success, bytes memory returndata) internal pure returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            return returndata;
        }
    }

    /**
     * @dev Reverts with returndata if present. Otherwise reverts with {FailedInnerCall}.
     */
    function _revert(bytes memory returndata) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert FailedInnerCall();
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;



/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev An operation with an ERC20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data);
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return success && (returndata.length == 0 || abi.decode(returndata, (bool))) && address(token).code.length > 0;
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}


// File contracts/EsusuCircle.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;



interface IEsusuRegistry {
    function scoreOf(address who) external view returns (uint256);
    function onPaid(address member) external;
    function onDefault(address member) external;
    function onCompleted(address member) external;
}

/// @title EsusuCircle
/// @notice Rotating savings circle (esusu / ajo / ROSCA) in the native token or one ERC-20.
///
/// Rules, all enforced here:
///  - `size` members each hold one payout SLOT (0..size-1). Slot r receives the pot in round r.
///  - Members pick their slot when they join and post collateral that depends on it:
///        collateral(slot) = dues * max(1, size - 1 - slot)
///    An early slot receives money sooner, so it locks more. After a member's own payout, their
///    remaining obligation is (size - 1 - slot) * dues, which the collateral covers exactly.
///    => a member who has been paid can never leave the circle owing it money (invariant I10).
///  - A member who misses a round loses `dues` of collateral into that round's pot and is flagged.
///  - A flagged member forfeits their payout slot; the pot rolls to the next slot.
///  - Payouts and refunds are pull-based. A protocol fee (<= 2%) is taken from payouts only.
contract EsusuCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State { Open, Active, Completed }

    // ---------------------------------------------------------------- config
    address public immutable registry;     // optional (zero = standalone, no reputation)
    address public immutable creator;
    address public immutable token;        // zero = native
    uint256 public immutable dues;         // per member per round
    uint256 public immutable size;         // members == slots == rounds
    uint256 public immutable roundDuration;
    uint256 public immutable minScore;     // reputation needed to join (needs registry)
    uint16  public immutable feeBps;
    address public immutable treasury;

    // ----------------------------------------------------------------- state
    State public state;
    uint256 public filled;
    mapping(uint256 => address) public slotOwner;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public slotOf;
    mapping(address => uint256) public collateralLeft;
    mapping(address => bool) public defaulted;

    uint256 public currentRound;
    uint256 public roundDeadline;
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => uint256) public pot;
    mapping(uint256 => uint256) public paidCount;
    mapping(address => uint256) public credit;

    // ---------------------------------------------------------------- events
    event Joined(address indexed member, uint256 indexed slot, uint256 collateral);
    event Left(address indexed member, uint256 indexed slot);
    event Started(uint256 deadline);
    event Contributed(uint256 indexed round, address indexed member, address indexed payer);
    event Defaulted(uint256 indexed round, address indexed member, uint256 slashed);
    event RoundSettled(uint256 indexed round, address indexed recipient, uint256 collected, uint256 fee, bool rolledOver);
    event Completed();
    event Withdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors
    error WrongState();
    error WrongAmount();
    error NotMember();
    error AlreadyMember();
    error SlotTaken();
    error ScoreTooLow();
    error AlreadyPaid();
    error RoundClosed();
    error RoundStillOpen();
    error NothingToWithdraw();
    error BadConfig();
    error TransferFailed();
    error UnsupportedToken();

    constructor(
        address registry_, address creator_, address token_, uint256 dues_, uint256 size_,
        uint256 roundDuration_, uint256 minScore_, uint16 feeBps_, address treasury_
    ) {
        if (dues_ == 0 || size_ < 2 || size_ > 50 || roundDuration_ < 60) revert BadConfig();
        if (feeBps_ > 200 || (feeBps_ > 0 && treasury_ == address(0))) revert BadConfig();
        if (minScore_ > 0 && registry_ == address(0)) revert BadConfig();
        registry = registry_;
        creator = creator_;
        token = token_;
        dues = dues_;
        size = size_;
        roundDuration = roundDuration_;
        minScore = minScore_;
        feeBps = feeBps_;
        treasury = treasury_;
    }

    // ------------------------------------------------------------------ join
    function collateralFor(uint256 slot) public view returns (uint256) {
        uint256 rounds = size - 1 - slot;
        return dues * (rounds == 0 ? 1 : rounds);
    }

    /// @notice Take payout slot `slot`, locking the collateral for that slot.
    function join(uint256 slot) external payable nonReentrant {
        if (state != State.Open) revert WrongState();
        if (slot >= size || slotOwner[slot] != address(0)) revert SlotTaken();
        if (isMember[msg.sender]) revert AlreadyMember();
        if (minScore > 0 && IEsusuRegistry(registry).scoreOf(msg.sender) < minScore) revert ScoreTooLow();

        uint256 col = collateralFor(slot);
        slotOwner[slot] = msg.sender;
        slotOf[msg.sender] = slot;
        isMember[msg.sender] = true;
        collateralLeft[msg.sender] = col;
        filled += 1;
        _pull(msg.sender, col);
        emit Joined(msg.sender, slot, col);

        if (filled == size) {
            state = State.Active;
            roundDeadline = block.timestamp + roundDuration;
            emit Started(roundDeadline);
        }
    }

    /// @notice Leave before the circle starts; refunds collateral and frees the slot.
    function leave() external nonReentrant {
        if (state != State.Open) revert WrongState();
        if (!isMember[msg.sender]) revert NotMember();
        uint256 slot = slotOf[msg.sender];
        uint256 refund = collateralLeft[msg.sender];
        collateralLeft[msg.sender] = 0;
        isMember[msg.sender] = false;
        slotOwner[slot] = address(0);
        slotOf[msg.sender] = 0;
        filled -= 1;
        _push(msg.sender, refund);
        emit Left(msg.sender, slot);
    }

    // ------------------------------------------------------------ contribute
    function contribute() external payable nonReentrant {
        _contribute(msg.sender);
    }

    /// @notice Pay `member`'s dues for the current round. Payer can be anyone (e.g. an agent vault);
    ///         the payment only ever credits `member`.
    function contributeFor(address member) external payable nonReentrant {
        _contribute(member);
    }

    function _contribute(address member) internal {
        if (state != State.Active) revert WrongState();
        if (!isMember[member]) revert NotMember();
        if (block.timestamp >= roundDeadline) revert RoundClosed();
        uint256 r = currentRound;
        if (paid[r][member]) revert AlreadyPaid();

        paid[r][member] = true;
        paidCount[r] += 1;
        pot[r] += dues;
        _pull(msg.sender, dues);
        emit Contributed(r, member, msg.sender);
    }

    // ---------------------------------------------------------------- settle
    /// @notice Close the round once everyone paid or the deadline passed. Anyone may call.
    function settleRound() external nonReentrant {
        if (state != State.Active) revert WrongState();
        uint256 r = currentRound;
        if (paidCount[r] != size && block.timestamp < roundDeadline) revert RoundStillOpen();

        IEsusuRegistry reg = IEsusuRegistry(registry);
        bool hasReg = registry != address(0);

        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            if (paid[r][m]) {
                if (hasReg) { try reg.onPaid(m) {} catch {} }
            } else {
                uint256 left = collateralLeft[m];
                uint256 cut = left < dues ? left : dues;
                collateralLeft[m] = left - cut;
                pot[r] += cut;
                defaulted[m] = true;
                emit Defaulted(r, m, cut);
                if (hasReg) { try reg.onDefault(m) {} catch {} }
            }
        }

        address recipient = slotOwner[r];
        uint256 collected = pot[r];
        pot[r] = 0;
        uint256 fee;
        bool rolled;

        if (!defaulted[recipient]) {
            fee = (collected * feeBps) / 10_000;
            credit[recipient] += collected - fee;
            if (fee > 0) credit[treasury] += fee;
        } else if (r + 1 < size) {
            pot[r + 1] += collected;
            rolled = true;
        } else {
            _splitAmongHonest(collected);
            rolled = true;
        }
        emit RoundSettled(r, recipient, collected, fee, rolled);

        if (r + 1 == size) {
            state = State.Completed;
            for (uint256 i = 0; i < size; i++) {
                address m = slotOwner[i];
                credit[m] += collateralLeft[m];
                collateralLeft[m] = 0;
                if (!defaulted[m] && hasReg) { try reg.onCompleted(m) {} catch {} }
            }
            emit Completed();
        } else {
            currentRound = r + 1;
            roundDeadline = block.timestamp + roundDuration;
        }
    }

    function _splitAmongHonest(uint256 amount) internal {
        uint256 honest;
        for (uint256 i = 0; i < size; i++) if (!defaulted[slotOwner[i]]) honest++;
        if (honest == 0) {
            credit[creator] += amount;
            return;
        }
        uint256 share = amount / honest;
        uint256 dust = amount - share * honest;
        bool dustGiven;
        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            if (!defaulted[m]) {
                credit[m] += share + (dustGiven ? 0 : dust);
                dustGiven = true;
            }
        }
    }

    // -------------------------------------------------------------- withdraw
    function withdraw() external nonReentrant {
        uint256 amount = credit[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credit[msg.sender] = 0;
        _push(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------- transfers
    function _pull(address from, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert WrongAmount();
        } else {
            if (msg.value != 0) revert WrongAmount();
            IERC20 t = IERC20(token);
            uint256 before = t.balanceOf(address(this));
            t.safeTransferFrom(from, address(this), amount);
            if (t.balanceOf(address(this)) - before != amount) revert UnsupportedToken(); // fee-on-transfer etc.
        }
    }

    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ----------------------------------------------------------------- views
    function members() external view returns (address[] memory out) {
        out = new address[](size);
        for (uint256 i = 0; i < size; i++) out[i] = slotOwner[i];
    }

    function currentRecipient() external view returns (address) {
        return state == State.Active ? slotOwner[currentRound] : address(0);
    }

    function hasPaid(address member) external view returns (bool) {
        return paid[currentRound][member];
    }

    /// @notice Everything the contract owes, for solvency checks: balance must equal this.
    function liabilities(address[] calldata extra) external view returns (uint256 total) {
        for (uint256 i = 0; i < size; i++) {
            address m = slotOwner[i];
            total += credit[m] + collateralLeft[m];
        }
        for (uint256 i = 0; i < extra.length; i++) total += credit[extra[i]];
        for (uint256 r = currentRound; r < size; r++) total += pot[r];
    }
}


// File contracts/EsusuRegistry.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.20;


/// @title EsusuRegistry
/// @notice Factory + portable reputation for esusu circles.
///         Only circles deployed by this registry can write reputation, so a score cannot be
///         forged by an arbitrary contract. Any protocol can read `scoreOf(address)`.
contract EsusuRegistry is Ownable {
    uint16 public constant MAX_FEE_BPS = 200; // 2%

    struct Rep {
        uint32 completed;   // circles finished without a default
        uint32 paidRounds;  // rounds paid in time
        uint32 defaults;    // rounds missed
    }

    address public treasury;
    uint16 public feeBps;
    address[] public circles;
    mapping(address => bool) public isCircle;
    mapping(address => Rep) private _rep;

    event CircleCreated(address indexed circle, address indexed creator, address indexed token, uint256 dues, uint256 size, uint256 roundDuration, uint256 minScore);
    event FeeSet(uint16 feeBps, address treasury);

    error NotCircle();
    error FeeTooHigh();

    constructor(address owner_, address treasury_, uint16 feeBps_) Ownable(owner_) {
        _setFee(feeBps_, treasury_);
    }

    function setFee(uint16 feeBps_, address treasury_) external onlyOwner {
        _setFee(feeBps_, treasury_);
    }

    function _setFee(uint16 feeBps_, address treasury_) internal {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ > 0 && treasury_ == address(0)) revert FeeTooHigh();
        feeBps = feeBps_;
        treasury = treasury_;
        emit FeeSet(feeBps_, treasury_);
    }

    /// @param token ERC-20 used for dues and collateral, or address(0) for the native token.
    /// @param minScore reputation required to join (0 = open to everyone).
    function createCircle(address token, uint256 dues, uint256 size, uint256 roundDuration, uint256 minScore)
        external
        returns (address circle)
    {
        EsusuCircle c = new EsusuCircle(address(this), msg.sender, token, dues, size, roundDuration, minScore, feeBps, treasury);
        circle = address(c);
        isCircle[circle] = true;
        circles.push(circle);
        emit CircleCreated(circle, msg.sender, token, dues, size, roundDuration, minScore);
    }

    // ------------------------------------------------------ reputation (circles only)
    modifier onlyCircle() {
        if (!isCircle[msg.sender]) revert NotCircle();
        _;
    }

    function onPaid(address member) external onlyCircle {
        unchecked { _rep[member].paidRounds += 1; }
    }

    function onDefault(address member) external onlyCircle {
        unchecked { _rep[member].defaults += 1; }
    }

    function onCompleted(address member) external onlyCircle {
        unchecked { _rep[member].completed += 1; }
    }

    // ----------------------------------------------------------------- views
    function reputation(address who) external view returns (Rep memory) {
        return _rep[who];
    }

    /// @notice 0..1000. +150 per clean completed circle, +15 per round paid, -250 per missed round.
    function scoreOf(address who) public view returns (uint256) {
        Rep memory r = _rep[who];
        uint256 up = uint256(r.completed) * 150 + uint256(r.paidRounds) * 15;
        if (up > 1000) up = 1000;
        uint256 down = uint256(r.defaults) * 250;
        return down >= up ? 0 : up - down;
    }

    function circlesCount() external view returns (uint256) {
        return circles.length;
    }

    function circlesPage(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = circles.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = circles[i];
    }
}
