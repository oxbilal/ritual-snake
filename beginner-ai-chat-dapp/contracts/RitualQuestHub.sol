// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RitualQuestHub {
    uint8 public constant TASK_CHECK_IN = 0;
    uint8 public constant TASK_PING = 1;
    uint8 public constant TASK_BOOST = 2;
    uint8 public constant TASK_SIGNAL = 3;
    uint8 public constant TASK_CLAIM_XP = 4;
    uint8 public constant TASK_STREAK_PROTECT = 5;

    uint8 public constant CORE_TASK_MASK =
        (uint8(1) << TASK_CHECK_IN) |
        (uint8(1) << TASK_PING) |
        (uint8(1) << TASK_BOOST) |
        (uint8(1) << TASK_SIGNAL);
    uint8 public constant ALL_TASK_MASK =
        CORE_TASK_MASK |
        (uint8(1) << TASK_CLAIM_XP) |
        (uint8(1) << TASK_STREAK_PROTECT);

    uint16 public constant CHECK_IN_XP = 25;
    uint16 public constant PING_XP = 35;
    uint16 public constant BOOST_XP = 45;
    uint16 public constant SIGNAL_XP = 30;
    uint16 public constant CLAIM_XP = 80;
    uint16 public constant STREAK_PROTECT_XP = 20;

    uint256 private constant ACTIVITY_LIMIT = 12;

    struct Player {
        uint256 totalXP;
        uint256 streak;
        uint256 level;
        uint256 lastActionDay;
        uint256 lastCheckInDay;
        uint256 protectionCharges;
        uint256 badges;
        uint256 actionCount;
    }

    struct PlayerSummary {
        uint256 totalXP;
        uint256 streak;
        uint256 level;
        uint256 lastActionDay;
        uint256 lastCheckInDay;
        uint256 protectionCharges;
        uint256 badges;
        uint8 completedToday;
        uint256 actionCount;
    }

    struct Activity {
        uint256 day;
        uint256 timestamp;
        uint8 taskId;
        uint16 xp;
        uint256 totalXP;
    }

    mapping(address => Player) private players;
    mapping(address => mapping(uint256 => uint8)) private completedTasksByDay;
    mapping(address => Activity[ACTIVITY_LIMIT]) private recentActivity;

    event QuestCompleted(
        address indexed user,
        uint8 indexed taskId,
        uint16 xp,
        uint256 totalXP,
        uint256 streak,
        uint256 level,
        uint256 day
    );
    event BadgeUnlocked(address indexed user, uint8 indexed badgeId, uint256 badges);

    function checkIn() external {
        _completeTask(TASK_CHECK_IN);
    }

    function dailyPing() external {
        _completeTask(TASK_PING);
    }

    function dailyBoost() external {
        _completeTask(TASK_BOOST);
    }

    function ritualSignal() external {
        _completeTask(TASK_SIGNAL);
    }

    function claimDailyXP() external {
        _completeTask(TASK_CLAIM_XP);
    }

    function streakProtect() external {
        _completeTask(TASK_STREAK_PROTECT);
    }

    function getPlayer(address user) external view returns (PlayerSummary memory) {
        Player storage player = players[user];
        return PlayerSummary({
            totalXP: player.totalXP,
            streak: player.streak,
            level: _levelForXP(player.totalXP),
            lastActionDay: player.lastActionDay,
            lastCheckInDay: player.lastCheckInDay,
            protectionCharges: player.protectionCharges,
            badges: player.badges,
            completedToday: completedTasksByDay[user][_today()],
            actionCount: player.actionCount
        });
    }

    function getCompletedTasks(address user, uint256 dayNumber) external view returns (uint8) {
        return completedTasksByDay[user][dayNumber];
    }

    function getRecentActions(address user) external view returns (Activity[] memory actions) {
        Player storage player = players[user];
        uint256 count = player.actionCount < ACTIVITY_LIMIT ? player.actionCount : ACTIVITY_LIMIT;
        actions = new Activity[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 actionNumber = player.actionCount - 1 - i;
            actions[i] = recentActivity[user][actionNumber % ACTIVITY_LIMIT];
        }
    }

    function xpForTask(uint8 taskId) public pure returns (uint16) {
        if (taskId == TASK_CHECK_IN) return CHECK_IN_XP;
        if (taskId == TASK_PING) return PING_XP;
        if (taskId == TASK_BOOST) return BOOST_XP;
        if (taskId == TASK_SIGNAL) return SIGNAL_XP;
        if (taskId == TASK_CLAIM_XP) return CLAIM_XP;
        if (taskId == TASK_STREAK_PROTECT) return STREAK_PROTECT_XP;
        revert("Unknown task");
    }

    function _completeTask(uint8 taskId) private {
        uint256 dayNumber = _today();
        uint8 taskBit = uint8(1) << taskId;
        uint8 completed = completedTasksByDay[msg.sender][dayNumber];

        require((completed & taskBit) == 0, "Task already complete today");
        if (taskId == TASK_CLAIM_XP) {
            require((completed & CORE_TASK_MASK) == CORE_TASK_MASK, "Complete core ritual first");
        }

        Player storage player = players[msg.sender];
        if (taskId == TASK_CHECK_IN) {
            _updateStreak(player, dayNumber);
        }
        if (taskId == TASK_STREAK_PROTECT && player.protectionCharges < 3) {
            player.protectionCharges += 1;
        }

        uint16 xp = xpForTask(taskId);
        player.totalXP += xp;
        player.level = _levelForXP(player.totalXP);
        player.lastActionDay = dayNumber;

        completedTasksByDay[msg.sender][dayNumber] = completed | taskBit;
        _recordActivity(msg.sender, player, Activity(dayNumber, block.timestamp, taskId, xp, player.totalXP));
        _refreshBadges(msg.sender, player, completedTasksByDay[msg.sender][dayNumber]);

        emit QuestCompleted(msg.sender, taskId, xp, player.totalXP, player.streak, player.level, dayNumber);
    }

    function _updateStreak(Player storage player, uint256 dayNumber) private {
        if (player.lastCheckInDay == 0) {
            player.streak = 1;
        } else if (player.lastCheckInDay + 1 == dayNumber) {
            player.streak += 1;
        } else if (player.lastCheckInDay + 2 == dayNumber && player.protectionCharges > 0) {
            player.protectionCharges -= 1;
            player.streak += 1;
        } else if (player.lastCheckInDay != dayNumber) {
            player.streak = 1;
        }

        player.lastCheckInDay = dayNumber;
    }

    function _recordActivity(address user, Player storage player, Activity memory activity) private {
        recentActivity[user][player.actionCount % ACTIVITY_LIMIT] = activity;
        player.actionCount += 1;
    }

    function _refreshBadges(address user, Player storage player, uint8 completedToday) private {
        uint256 earned = player.badges;
        if (player.actionCount >= 1) earned |= 1 << 0;
        if (player.streak >= 3) earned |= 1 << 1;
        if (player.streak >= 7) earned |= 1 << 2;
        if (player.totalXP >= 500) earned |= 1 << 3;
        if (_levelForXP(player.totalXP) >= 5) earned |= 1 << 4;
        if ((completedToday & ALL_TASK_MASK) == ALL_TASK_MASK) earned |= 1 << 5;

        uint256 newlyEarned = earned & ~player.badges;
        player.badges = earned;

        for (uint8 badgeId = 0; badgeId < 6; badgeId++) {
            if ((newlyEarned & (1 << badgeId)) != 0) {
                emit BadgeUnlocked(user, badgeId, earned);
            }
        }
    }

    function _levelForXP(uint256 xp) private pure returns (uint256) {
        return (xp / 250) + 1;
    }

    function _today() private view returns (uint256) {
        return block.timestamp / 1 days;
    }
}
