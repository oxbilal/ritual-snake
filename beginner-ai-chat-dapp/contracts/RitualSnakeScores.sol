// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RitualSnakeScores {
    struct LeaderboardEntry {
        address player;
        uint256 score;
        string rank;
    }

    mapping(address => uint256) public bestScore;
    mapping(address => uint256) public totalPoints;
    mapping(address => uint256) public totalGames;
    mapping(address => bool) private seenPlayer;
    address[] private players;

    event RunStarted(address player, uint256 timestamp);
    event ScoreSubmitted(address player, uint256 score, uint256 totalPoints, uint256 bestScore, string rank);

    function startRun() external {
        emit RunStarted(msg.sender, block.timestamp);
    }

    function submitScore(uint256 score) external {
        require(score > 0, "Score must be greater than zero");

        if (!seenPlayer[msg.sender]) {
            seenPlayer[msg.sender] = true;
            players.push(msg.sender);
        }

        totalGames[msg.sender] += 1;
        totalPoints[msg.sender] += score;

        if (score > bestScore[msg.sender]) {
            bestScore[msg.sender] = score;
        }

        string memory rank = getRank(totalPoints[msg.sender]);
        emit ScoreSubmitted(msg.sender, score, totalPoints[msg.sender], bestScore[msg.sender], rank);
    }

    function getRank(uint256 score) public pure returns (string memory) {
        if (score >= 5000) return "Legendary";
        if (score >= 3000) return "Master";
        if (score >= 2000) return "Expert";
        if (score >= 1000) return "Advanced";
        return "Beginner";
    }

    function getPlayer(address player)
        external
        view
        returns (uint256 playerTotalPoints, uint256 playerBestScore, uint256 playerTotalGames, string memory rank)
    {
        playerTotalPoints = totalPoints[player];
        playerBestScore = bestScore[player];
        playerTotalGames = totalGames[player];
        rank = getRank(playerTotalPoints);
    }

    function getPlayers() external view returns (address[] memory) {
        return players;
    }

    function getLeaderboard() external view returns (LeaderboardEntry[] memory entries) {
        entries = new LeaderboardEntry[](players.length);

        for (uint256 i = 0; i < players.length; i += 1) {
            address player = players[i];
            entries[i] = LeaderboardEntry({ player: player, score: totalPoints[player], rank: getRank(totalPoints[player]) });
        }
    }
}
