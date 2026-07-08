import React from "react";
import { Search, X, ArrowUpDown, SlidersHorizontal, Check } from "lucide-react";
import ViewToggle from "./ViewToggle";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import type { PoolSortState, PoolSortField } from "@/lib/types";

const SORT_LABELS: Record<PoolSortField, string> = {
  tvl: "TVL",
  name: "Name",
  fees: "Total Fees",
  bullBias: "Bull Bias",
};

interface PoolSearchProps {
  searchQuery: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  sortState: PoolSortState;
  onSortFieldChange: (field: PoolSortField) => void;
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  baseTokenFilter: string;
  onBaseTokenFilterChange: (value: string) => void;
  baseTokenOptions: string[];
  priceFeedFilter: string;
  onPriceFeedFilterChange: (value: string) => void;
  priceFeedOptions: string[];
}

// Matches the ViewToggle palette (bg-gray-100/dark:bg-gray-800) for a consistent control row.
const triggerClass =
  "flex items-center gap-2 px-3 py-3 rounded-2xl text-sm font-medium bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200";

const PoolSearch: React.FC<PoolSearchProps> = ({
  searchQuery,
  onSearchChange,
  onClearSearch,
  viewMode,
  onViewModeChange,
  sortState,
  onSortFieldChange,
  onSortOrderChange,
  baseTokenFilter,
  onBaseTokenFilterChange,
  baseTokenOptions,
  priceFeedFilter,
  onPriceFeedFilterChange,
  priceFeedOptions,
}) => {
  // activeFilterCount reflects APPLIED filters (from props), so the trigger badge
  // only changes after Apply, not while staging selections.
  const activeFilterCount =
    (baseTokenFilter !== 'all' ? 1 : 0) + (priceFeedFilter !== 'all' ? 1 : 0);

  // Staged filter state: selections are held locally and only committed on Apply.
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [stagedBaseToken, setStagedBaseToken] = React.useState(baseTokenFilter);
  const [stagedPriceFeed, setStagedPriceFeed] = React.useState(priceFeedFilter);

  const handleFilterOpenChange = (open: boolean): void => {
    // Re-sync staged selections to the currently applied filters each time the menu opens.
    if (open) {
      setStagedBaseToken(baseTokenFilter);
      setStagedPriceFeed(priceFeedFilter);
    }
    setFilterOpen(open);
  };

  const applyFilters = (): void => {
    onBaseTokenFilterChange(stagedBaseToken);
    onPriceFeedFilterChange(stagedPriceFeed);
    setFilterOpen(false);
  };

  // Reset clears filters immediately (no Apply needed) and closes the menu.
  const resetStaged = (): void => {
    setStagedBaseToken('all');
    setStagedPriceFeed('all');
    onBaseTokenFilterChange('all');
    onPriceFeedFilterChange('all');
    setFilterOpen(false);
  };

  const stagedDirty =
    stagedBaseToken !== baseTokenFilter || stagedPriceFeed !== priceFeedFilter;
  const stagedHasFilters = stagedBaseToken !== 'all' || stagedPriceFeed !== 'all';

  return (
    <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
      <div className="relative w-full sm:flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search pools by name, token symbol, price feed, or chain..."
          value={searchQuery}
          onChange={onSearchChange}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-2xl dark:bg-[#10151c] dark:text-white dark:border-gray-600 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={onClearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
            type="button"
          >
            <X className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 justify-end sm:gap-3">
        {/* Sort control */}
        <DropdownMenu>
          <DropdownMenuTrigger className={triggerClass} type="button" aria-label="Sort pools">
            <ArrowUpDown size={16} />
            <span className="hidden sm:inline">Sort: {SORT_LABELS[sortState.field]}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortState.field}
              onValueChange={(v) => onSortFieldChange(v as PoolSortField)}
            >
              {(Object.keys(SORT_LABELS) as PoolSortField[]).map((field) => (
                <DropdownMenuRadioItem key={field} value={field}>
                  {SORT_LABELS[field]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sortState.order}
              onValueChange={(v) => onSortOrderChange(v as 'asc' | 'desc')}
            >
              <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filter control, staged: selections commit only on Apply */}
        <DropdownMenu open={filterOpen} onOpenChange={handleFilterOpenChange}>
          <DropdownMenuTrigger className={triggerClass} type="button" aria-label="Filter pools">
            <SlidersHorizontal size={16} />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </DropdownMenuTrigger>
          {/* onSelect preventDefault keeps the menu open while staging; nothing applies until Apply. */}
          <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
            <DropdownMenuLabel>Base Token</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={stagedBaseToken} onValueChange={setStagedBaseToken}>
              <DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>All base tokens</DropdownMenuRadioItem>
              {baseTokenOptions.map((symbol) => (
                <DropdownMenuRadioItem key={symbol} value={symbol} onSelect={(e) => e.preventDefault()}>
                  {symbol}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Price Feed</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={stagedPriceFeed} onValueChange={setStagedPriceFeed}>
              <DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>All price feeds</DropdownMenuRadioItem>
              {priceFeedOptions.map((feed) => (
                <DropdownMenuRadioItem key={feed} value={feed} onSelect={(e) => e.preventDefault()}>
                  {feed}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={resetStaged}
                disabled={!stagedHasFilters && activeFilterCount === 0}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={applyFilters}
                disabled={!stagedDirty}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={14} />
                Apply
              </button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
    </div>
  );
};

export default PoolSearch;
