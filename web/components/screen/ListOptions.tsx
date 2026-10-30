import type { Filter, Sort } from "@/lib/listing";
import styles from "./screen.module.css";

const SORT_LABELS: Record<Sort, string> = { auto: "AUTO", number: "#", name: "A–Z", total: "BST" };

interface Props {
  filter: Filter;
  sort: Sort;
  /** The D-pad is on this row: ◀ ▶ change the filter, A the sort. */
  selected: boolean;
  onFilterStep: (delta: number) => void;
  onSortStep: () => void;
}

/** "TYPE ◀ FIRE ▶   SORT: BST" row between the search field and the region bar. */
export function ListOptions({ filter, sort, selected, onFilterStep, onSortStep }: Props) {
  const filterLabel = filter === "all" ? "ALL" : filter === "favorites" ? "★ FAV" : filter.toUpperCase();
  return (
    <div className={styles.options} data-selected={selected}>
      <span className={styles.optionLabel}>TYPE</span>
      <button type="button" onClick={() => onFilterStep(-1)} aria-label="Previous filter">
        ◀
      </button>
      <span className={styles.optionValue} data-type={filter}>
        {filterLabel}
      </span>
      <button type="button" onClick={() => onFilterStep(1)} aria-label="Next filter">
        ▶
      </button>
      <button type="button" className={styles.sortButton} onClick={onSortStep} aria-label="Change sort order">
        SORT {SORT_LABELS[sort]}
      </button>
    </div>
  );
}
