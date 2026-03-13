// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Temporary placeholder to verify compilation works
// Deleted before Phase 2
contract Lock {
    uint public unlockTime;
    address payable public owner;

    constructor(uint _unlockTime) payable {
        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }
}
