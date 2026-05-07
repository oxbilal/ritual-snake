// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "ERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 value) public virtual {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        require(balanceOf[from] >= value, "ERC20: insufficient balance");
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ERC20: zero address");
        require(balanceOf[from] >= value, "ERC20: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

contract WrappedRitual is MockERC20 {
    event Deposit(address indexed account, uint256 value);
    event Withdrawal(address indexed account, uint256 value);

    constructor() MockERC20("Wrapped Ritual", "WRITUAL", 18) {}

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 value) external {
        _burn(msg.sender, value);
        (bool ok,) = msg.sender.call{value: value}("");
        require(ok, "WRITUAL: transfer failed");
        emit Withdrawal(msg.sender, value);
    }
}

contract RitualPair is MockERC20 {
    address public factory;
    address public token0;
    address public token1;
    uint112 private reserve0;
    uint112 private reserve1;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    event Sync(uint112 reserve0, uint112 reserve1);

    constructor() MockERC20("Ritual LP", "rLP", 18) {
        factory = msg.sender;
    }

    function initialize(address token0_, address token1_) external {
        require(msg.sender == factory, "Pair: forbidden");
        require(token0 == address(0) && token1 == address(0), "Pair: initialized");
        token0 = token0_;
        token1 = token1_;
    }

    function getReserves() external view returns (uint112, uint112) {
        return (reserve0, reserve1);
    }

    function mint(address to) external returns (uint256 liquidity) {
        (uint112 r0, uint112 r1) = (reserve0, reserve1);
        uint256 balance0 = MockERC20(token0).balanceOf(address(this));
        uint256 balance1 = MockERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - r0;
        uint256 amount1 = balance1 - r1;

        if (totalSupply == 0) {
            liquidity = sqrt(amount0 * amount1);
            require(liquidity > 1000, "Pair: low liquidity");
            totalSupply = 1000;
            balanceOf[address(0)] = 1000;
            emit Transfer(address(0), address(0), 1000);
        } else {
            liquidity = min((amount0 * totalSupply) / r0, (amount1 * totalSupply) / r1);
        }

        require(liquidity > 0, "Pair: low liquidity minted");
        totalSupply += liquidity;
        balanceOf[to] += liquidity;
        emit Transfer(address(0), to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        require(amount0Out > 0 || amount1Out > 0, "Pair: zero output");
        (uint112 r0, uint112 r1) = (reserve0, reserve1);
        require(amount0Out < r0 && amount1Out < r1, "Pair: insufficient liquidity");

        if (amount0Out > 0) MockERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) MockERC20(token1).transfer(to, amount1Out);

        uint256 balance0 = MockERC20(token0).balanceOf(address(this));
        uint256 balance1 = MockERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "Pair: zero input");

        uint256 balance0Adjusted = (balance0 * 1000) - (amount0In * 3);
        uint256 balance1Adjusted = (balance1 * 1000) - (amount1In * 3);
        require(balance0Adjusted * balance1Adjusted >= uint256(r0) * uint256(r1) * 1_000_000, "Pair: invariant");

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "Pair: overflow");
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        emit Sync(reserve0, reserve1);
    }

    function min(uint256 x, uint256 y) private pure returns (uint256) {
        return x < y ? x : y;
    }

    function sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}

contract RitualFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) public returns (address pair) {
        require(tokenA != tokenB, "Factory: identical tokens");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Factory: zero address");
        require(getPair[token0][token1] == address(0), "Factory: pair exists");

        RitualPair newPair = new RitualPair();
        newPair.initialize(token0, token1);
        pair = address(newPair);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}

contract RitualRouter {
    address public immutable factory;
    address public immutable wrappedRitual;

    constructor(address factory_, address wrappedRitual_) {
        factory = factory_;
        wrappedRitual = wrappedRitual_;
    }

    receive() external payable {
        require(msg.sender == wrappedRitual, "Router: direct RITUAL rejected");
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address to
    ) external returns (uint256 liquidity) {
        address pair = RitualFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) pair = RitualFactory(factory).createPair(tokenA, tokenB);
        MockERC20(tokenA).transferFrom(msg.sender, pair, amountA);
        MockERC20(tokenB).transferFrom(msg.sender, pair, amountB);
        liquidity = RitualPair(pair).mint(to);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        return _getAmountsOut(amountIn, path);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external returns (uint256[] memory amounts) {
        amounts = _getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Router: slippage");
        MockERC20(path[0]).transferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactRitualForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external payable returns (uint256[] memory amounts) {
        require(path[0] == wrappedRitual, "Router: path must start WRITUAL");
        amounts = _getAmountsOut(msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Router: slippage");
        WrappedRitual(payable(wrappedRitual)).deposit{value: msg.value}();
        MockERC20(wrappedRitual).transfer(pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactTokensForRitual(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external returns (uint256[] memory amounts) {
        require(path[path.length - 1] == wrappedRitual, "Router: path must end WRITUAL");
        amounts = _getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "Router: slippage");
        MockERC20(path[0]).transferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        WrappedRitual(payable(wrappedRitual)).withdraw(amounts[amounts.length - 1]);
        (bool ok,) = to.call{value: amounts[amounts.length - 1]}("");
        require(ok, "Router: RITUAL transfer failed");
    }

    function pairFor(address tokenA, address tokenB) public view returns (address pair) {
        pair = RitualFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Router: pair missing");
    }

    function _swap(uint256[] memory amounts, address[] calldata path, address to) private {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            address pair = pairFor(input, output);
            (address token0,) = input < output ? (input, output) : (output, input);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address nextTo = i < path.length - 2 ? pairFor(output, path[i + 2]) : to;
            RitualPair(pair).swap(amount0Out, amount1Out, nextTo);
        }
    }

    function _getAmountsOut(uint256 amountIn, address[] calldata path) private view returns (uint256[] memory amounts) {
        require(path.length >= 2, "Router: invalid path");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            address pair = pairFor(path[i], path[i + 1]);
            (uint112 reserve0, uint112 reserve1) = RitualPair(pair).getReserves();
            (uint256 reserveIn, uint256 reserveOut) = path[i] < path[i + 1]
                ? (uint256(reserve0), uint256(reserve1))
                : (uint256(reserve1), uint256(reserve0));
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut) {
        require(amountIn > 0, "Router: zero input");
        require(reserveIn > 0 && reserveOut > 0, "Router: insufficient liquidity");
        uint256 amountInWithFee = amountIn * 997;
        amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }
}
