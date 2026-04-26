// =====================================================
// Sample data — replaced by real backend later.
// =====================================================

const NOW = new Date();

function isoOffset(daysAgo, hours = 14, minutes = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export const SAMPLE_PROBLEMS = [
  {
    id: "p1",
    number: 1,
    title: "Two Sum",
    difficulty: "Easy",
    tags: ["array", "hash-map"],
    solvedAt: isoOffset(0, 10, 24),
    description:
      "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.",
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists.",
    ],
    solutions: {
      python: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            complement = target - n
            if complement in seen:
                return [seen[complement], i]
            seen[n] = i
        return []`,
      cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); ++i) {
            int complement = target - nums[i];
            if (seen.count(complement)) {
                return {seen[complement], i};
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};`,
      java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[]{ seen.get(complement), i };
            }
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}`,
    },
    note: "Classic warm-up. The hash map turns the inner loop O(n) into O(1) per element — single pass is enough because we record indices as we go.",
  },
  {
    id: "p2",
    number: 146,
    title: "LRU Cache",
    difficulty: "Medium",
    tags: ["linked-list", "hash-map", "design"],
    solvedAt: isoOffset(0, 9, 12),
    description:
      "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement the `LRUCache` class with `get` and `put` operations, both running in O(1) average time.",
    constraints: [
      "1 <= capacity <= 3000",
      "0 <= key, value <= 10^4",
      "At most 2 * 10^5 calls will be made.",
    ],
    solutions: {
      python: `class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)`,
      cpp: `class LRUCache {
    int cap;
    list<pair<int,int>> dq;
    unordered_map<int, list<pair<int,int>>::iterator> mp;
public:
    LRUCache(int capacity) : cap(capacity) {}

    int get(int key) {
        if (!mp.count(key)) return -1;
        dq.splice(dq.begin(), dq, mp[key]);
        return mp[key]->second;
    }

    void put(int key, int value) {
        if (mp.count(key)) {
            mp[key]->second = value;
            dq.splice(dq.begin(), dq, mp[key]);
            return;
        }
        if (dq.size() == cap) {
            mp.erase(dq.back().first);
            dq.pop_back();
        }
        dq.emplace_front(key, value);
        mp[key] = dq.begin();
    }
};`,
      java: `class LRUCache extends LinkedHashMap<Integer, Integer> {
    private final int cap;

    public LRUCache(int capacity) {
        super(capacity, 0.75f, true);
        this.cap = capacity;
    }

    public int get(int key) {
        return super.getOrDefault(key, -1);
    }

    public void put(int key, int value) {
        super.put(key, value);
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
        return size() > cap;
    }
}`,
    },
    note: "OrderedDict in Python is essentially this problem solved for you. The interesting bit is realizing both ops need to be O(1) — a doubly-linked list + hash map gives you that.",
  },
  {
    id: "p3",
    number: 200,
    title: "Number of Islands",
    difficulty: "Medium",
    tags: ["graph", "dfs", "matrix"],
    solvedAt: isoOffset(1, 16, 30),
    description:
      "Given an `m x n` 2D binary grid which represents a map of `'1'`s (land) and `'0'`s (water), return the number of islands.\n\nAn island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically.",
    constraints: [
      "m == grid.length",
      "n == grid[i].length",
      "1 <= m, n <= 300",
      "grid[i][j] is '0' or '1'.",
    ],
    solutions: {
      python: `class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        if not grid: return 0
        rows, cols = len(grid), len(grid[0])
        count = 0

        def dfs(r, c):
            if r < 0 or r >= rows or c < 0 or c >= cols:
                return
            if grid[r][c] != '1':
                return
            grid[r][c] = '#'
            dfs(r+1, c); dfs(r-1, c); dfs(r, c+1); dfs(r, c-1)

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == '1':
                    count += 1
                    dfs(r, c)
        return count`,
      cpp: `class Solution {
public:
    int numIslands(vector<vector<char>>& grid) {
        int rows = grid.size(), cols = grid[0].size(), count = 0;
        function<void(int,int)> dfs = [&](int r, int c) {
            if (r < 0 || r >= rows || c < 0 || c >= cols) return;
            if (grid[r][c] != '1') return;
            grid[r][c] = '#';
            dfs(r+1,c); dfs(r-1,c); dfs(r,c+1); dfs(r,c-1);
        };
        for (int r = 0; r < rows; ++r)
            for (int c = 0; c < cols; ++c)
                if (grid[r][c] == '1') { ++count; dfs(r, c); }
        return count;
    }
};`,
      java: `class Solution {
    public int numIslands(char[][] grid) {
        int rows = grid.length, cols = grid[0].length, count = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r][c] == '1') { count++; dfs(grid, r, c, rows, cols); }
        return count;
    }
    private void dfs(char[][] g, int r, int c, int R, int C) {
        if (r < 0 || r >= R || c < 0 || c >= C || g[r][c] != '1') return;
        g[r][c] = '#';
        dfs(g, r+1, c, R, C); dfs(g, r-1, c, R, C);
        dfs(g, r, c+1, R, C); dfs(g, r, c-1, R, C);
    }
}`,
    },
    note: "Mutating the grid in-place to mark visited is cheaper than a separate visited set when the input isn't needed afterward.",
  },
  {
    id: "p4",
    number: 53,
    title: "Maximum Subarray",
    difficulty: "Medium",
    tags: ["array", "dp", "greedy"],
    solvedAt: isoOffset(2, 11, 4),
    description:
      "Given an integer array `nums`, find the contiguous subarray with the largest sum, and return its sum.\n\nKadane's algorithm solves this in linear time.",
    constraints: ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
    solutions: {
      python: `class Solution:
    def maxSubArray(self, nums: List[int]) -> int:
        best = cur = nums[0]
        for n in nums[1:]:
            cur = max(n, cur + n)
            best = max(best, cur)
        return best`,
      cpp: `class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        int best = nums[0], cur = nums[0];
        for (int i = 1; i < nums.size(); ++i) {
            cur = max(nums[i], cur + nums[i]);
            best = max(best, cur);
        }
        return best;
    }
};`,
      java: `class Solution {
    public int maxSubArray(int[] nums) {
        int best = nums[0], cur = nums[0];
        for (int i = 1; i < nums.length; i++) {
            cur = Math.max(nums[i], cur + nums[i]);
            best = Math.max(best, cur);
        }
        return best;
    }
}`,
    },
    note: "Kadane's. The decision at each step: extend the current run, or start over from this element.",
  },
  {
    id: "p5",
    number: 121,
    title: "Best Time to Buy and Sell Stock",
    difficulty: "Easy",
    tags: ["array", "dp"],
    solvedAt: isoOffset(2, 19, 45),
    description:
      "You are given an array `prices` where `prices[i]` is the price of a given stock on the i-th day.\n\nMaximize profit by choosing a single day to buy and a different later day to sell. Return 0 if no profit is possible.",
    constraints: ["1 <= prices.length <= 10^5", "0 <= prices[i] <= 10^4"],
    solutions: {
      python: `class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        lo, best = float('inf'), 0
        for p in prices:
            lo = min(lo, p)
            best = max(best, p - lo)
        return best`,
      cpp: `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int lo = INT_MAX, best = 0;
        for (int p : prices) {
            lo = min(lo, p);
            best = max(best, p - lo);
        }
        return best;
    }
};`,
      java: `class Solution {
    public int maxProfit(int[] prices) {
        int lo = Integer.MAX_VALUE, best = 0;
        for (int p : prices) {
            lo = Math.min(lo, p);
            best = Math.max(best, p - lo);
        }
        return best;
    }
}`,
    },
    note: "Track the minimum so far and the best profit if we sold today. One pass.",
  },
  {
    id: "p6",
    number: 42,
    title: "Trapping Rain Water",
    difficulty: "Hard",
    tags: ["array", "two-pointer", "stack"],
    solvedAt: isoOffset(3, 13, 18),
    description:
      "Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
    constraints: [
      "n == height.length",
      "1 <= n <= 2 * 10^4",
      "0 <= height[i] <= 10^5",
    ],
    solutions: {
      python: `class Solution:
    def trap(self, height: List[int]) -> int:
        l, r = 0, len(height) - 1
        lmax = rmax = 0
        water = 0
        while l < r:
            if height[l] < height[r]:
                lmax = max(lmax, height[l])
                water += lmax - height[l]
                l += 1
            else:
                rmax = max(rmax, height[r])
                water += rmax - height[r]
                r -= 1
        return water`,
      cpp: `class Solution {
public:
    int trap(vector<int>& height) {
        int l = 0, r = height.size() - 1, lmax = 0, rmax = 0, water = 0;
        while (l < r) {
            if (height[l] < height[r]) {
                lmax = max(lmax, height[l]);
                water += lmax - height[l++];
            } else {
                rmax = max(rmax, height[r]);
                water += rmax - height[r--];
            }
        }
        return water;
    }
};`,
      java: `class Solution {
    public int trap(int[] height) {
        int l = 0, r = height.length - 1, lmax = 0, rmax = 0, water = 0;
        while (l < r) {
            if (height[l] < height[r]) {
                lmax = Math.max(lmax, height[l]);
                water += lmax - height[l++];
            } else {
                rmax = Math.max(rmax, height[r]);
                water += rmax - height[r--];
            }
        }
        return water;
    }
}`,
    },
    note: "Two pointers from both ends. Whichever side has the smaller height bounds the water — move that pointer inward.",
  },
  {
    id: "p7",
    number: 21,
    title: "Merge Two Sorted Lists",
    difficulty: "Easy",
    tags: ["linked-list", "recursion"],
    solvedAt: isoOffset(4, 22, 8),
    description:
      "You are given the heads of two sorted linked lists `list1` and `list2`. Merge the two lists into one sorted list and return its head.",
    constraints: [
      "The number of nodes in both lists is in the range [0, 50].",
      "-100 <= Node.val <= 100",
      "Both list1 and list2 are sorted in non-decreasing order.",
    ],
    solutions: {
      python: `class Solution:
    def mergeTwoLists(self, l1, l2):
        dummy = ListNode()
        tail = dummy
        while l1 and l2:
            if l1.val <= l2.val:
                tail.next, l1 = l1, l1.next
            else:
                tail.next, l2 = l2, l2.next
            tail = tail.next
        tail.next = l1 or l2
        return dummy.next`,
      cpp: `class Solution {
public:
    ListNode* mergeTwoLists(ListNode* l1, ListNode* l2) {
        ListNode dummy, *tail = &dummy;
        while (l1 && l2) {
            if (l1->val <= l2->val) { tail->next = l1; l1 = l1->next; }
            else { tail->next = l2; l2 = l2->next; }
            tail = tail->next;
        }
        tail->next = l1 ? l1 : l2;
        return dummy.next;
    }
};`,
      java: `class Solution {
    public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(0), tail = dummy;
        while (l1 != null && l2 != null) {
            if (l1.val <= l2.val) { tail.next = l1; l1 = l1.next; }
            else { tail.next = l2; l2 = l2.next; }
            tail = tail.next;
        }
        tail.next = (l1 != null) ? l1 : l2;
        return dummy.next;
    }
}`,
    },
    note: "Dummy head + tail pointer keeps the merge logic clean.",
  },
  {
    id: "p8",
    number: 76,
    title: "Minimum Window Substring",
    difficulty: "Hard",
    tags: ["string", "sliding-window", "hash-map"],
    solvedAt: isoOffset(5, 14, 22),
    description:
      "Given two strings `s` and `t`, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If no such substring exists, return the empty string.",
    constraints: ["m == s.length", "n == t.length", "1 <= m, n <= 10^5"],
    solutions: {
      python: `class Solution:
    def minWindow(self, s: str, t: str) -> str:
        need = Counter(t)
        missing = len(t)
        i = start = end = 0
        for j, c in enumerate(s, 1):
            if need[c] > 0: missing -= 1
            need[c] -= 1
            if missing == 0:
                while i < j and need[s[i]] < 0:
                    need[s[i]] += 1
                    i += 1
                if not end or j - i < end - start:
                    start, end = i, j
                need[s[i]] += 1
                missing += 1
                i += 1
        return s[start:end]`,
      cpp: `class Solution {
public:
    string minWindow(string s, string t) {
        vector<int> need(128, 0);
        for (char c : t) need[c]++;
        int missing = t.size(), i = 0, start = 0, end = 0;
        for (int j = 1; j <= s.size(); ++j) {
            if (need[s[j-1]]-- > 0) missing--;
            if (missing == 0) {
                while (i < j && need[s[i]] < 0) need[s[i++]]++;
                if (end == 0 || j - i < end - start) { start = i; end = j; }
                need[s[i++]]++;
                missing++;
            }
        }
        return s.substr(start, end - start);
    }
};`,
      java: `class Solution {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        for (char c : t.toCharArray()) need[c]++;
        int missing = t.length(), i = 0, start = 0, end = 0;
        for (int j = 1; j <= s.length(); j++) {
            if (need[s.charAt(j-1)]-- > 0) missing--;
            if (missing == 0) {
                while (i < j && need[s.charAt(i)] < 0) need[s.charAt(i++)]++;
                if (end == 0 || j - i < end - start) { start = i; end = j; }
                need[s.charAt(i++)]++;
                missing++;
            }
        }
        return s.substring(start, end);
    }
}`,
    },
    note: "Sliding window with a `missing` counter. Shrink from the left only when the window is valid.",
  },
];

// =====================================================
// Heatmap mock — 16 weeks x 7 days = 112 cells
// More density toward the present, with realistic gaps
// =====================================================
export function buildHeatmap() {
  const cells = [];
  const today = new Date(NOW);
  today.setHours(0, 0, 0, 0);

  // Today is the bottom-right; oldest is 111 days ago
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);

    // Bias toward more recent activity
    const recencyBoost = Math.max(0, 1 - i / 80);
    // Weekly rhythm: fewer entries on Sundays
    const weekdayPenalty = d.getDay() === 0 ? 0.4 : d.getDay() === 6 ? 0.7 : 1;
    // Random streaks
    const noise = Math.random();

    let count = 0;
    const r = noise * recencyBoost * weekdayPenalty;
    if (r > 0.78) count = 4;
    else if (r > 0.6) count = 3;
    else if (r > 0.4) count = 2;
    else if (r > 0.22) count = 1;
    else count = 0;

    cells.push({ count, dateIso: d.toISOString() });
  }

  // Force today to match SAMPLE_PROBLEMS count for today (=2)
  const todayCount = SAMPLE_PROBLEMS.filter((p) => {
    const pd = new Date(p.solvedAt);
    return (
      pd.getFullYear() === today.getFullYear() &&
      pd.getMonth() === today.getMonth() &&
      pd.getDate() === today.getDate()
    );
  }).length;
  cells[cells.length - 1].count = todayCount;

  return cells;
}

// =====================================================
// Fake AI bank — used to populate magic tiles
// =====================================================
export const FAKE_BANK = [
  { number: 3, title: "Longest Substring Without Repeating Characters", difficulty: "Medium", tags: ["string", "sliding-window", "hash-map"] },
  { number: 5, title: "Longest Palindromic Substring", difficulty: "Medium", tags: ["string", "dp"] },
  { number: 11, title: "Container With Most Water", difficulty: "Medium", tags: ["array", "two-pointer", "greedy"] },
  { number: 15, title: "3Sum", difficulty: "Medium", tags: ["array", "two-pointer", "sorting"] },
  { number: 20, title: "Valid Parentheses", difficulty: "Easy", tags: ["string", "stack"] },
  { number: 33, title: "Search in Rotated Sorted Array", difficulty: "Medium", tags: ["array", "binary-search"] },
  { number: 49, title: "Group Anagrams", difficulty: "Medium", tags: ["string", "hash-map", "sorting"] },
  { number: 56, title: "Merge Intervals", difficulty: "Medium", tags: ["array", "sorting", "intervals"] },
  { number: 70, title: "Climbing Stairs", difficulty: "Easy", tags: ["dp", "math"] },
  { number: 98, title: "Validate Binary Search Tree", difficulty: "Medium", tags: ["tree", "dfs", "bst"] },
  { number: 102, title: "Binary Tree Level Order Traversal", difficulty: "Medium", tags: ["tree", "bfs"] },
  { number: 124, title: "Binary Tree Maximum Path Sum", difficulty: "Hard", tags: ["tree", "dfs", "dp"] },
  { number: 139, title: "Word Break", difficulty: "Medium", tags: ["string", "dp", "trie"] },
  { number: 198, title: "House Robber", difficulty: "Medium", tags: ["dp", "array"] },
  { number: 207, title: "Course Schedule", difficulty: "Medium", tags: ["graph", "topological-sort"] },
  { number: 215, title: "Kth Largest Element in an Array", difficulty: "Medium", tags: ["array", "heap", "quickselect"] },
  { number: 238, title: "Product of Array Except Self", difficulty: "Medium", tags: ["array", "prefix-sum"] },
  { number: 322, title: "Coin Change", difficulty: "Medium", tags: ["dp", "array"] },
  { number: 347, title: "Top K Frequent Elements", difficulty: "Medium", tags: ["array", "heap", "hash-map"] },
  { number: 416, title: "Partition Equal Subset Sum", difficulty: "Medium", tags: ["dp", "knapsack"] },
];
