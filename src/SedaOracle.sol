// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

contract SedaOracle {
    uint256 public data_request_count;
    mapping(uint256 => DataRequest) public data_requests;

    struct DataRequest {
        string value;
    }

    event DataRequestPosted(uint256 id, string value);

    function postDataRequest(string memory _value) public {
        data_request_count++;
        data_requests[data_request_count] = DataRequest(_value);
        emit DataRequestPosted(data_request_count, _value);
    }
}
