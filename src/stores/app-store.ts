import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays, addYears, max, min, addDays } from 'date-fns';
export interface Member {
  id: string;
  name: string;
  joiningDate: Date;
  leaveDate: Date | null;
}
export interface Item {
  id: string;
  name: string;
  price: number;
  purchaseDate: Date;
  depreciationYears?: number;
  depreciationDays?: number;
}
interface AppState {
  members: Member[];
  items: Item[];
}
interface AppActions {
  addMember: (name: string, joiningDate: Date) => void;
  removeMember: (id: string) => void;
  updateMemberLeaveDate: (id: string, leaveDate: Date | null) => void;
  addItem: (item: Omit<Item, 'id'>) => void;
  editItem: (id: string, item: Omit<Item, 'id'>) => void;
  removeItem: (id: string) => void;
  resetStore: () => void;
}
const initialState: AppState = {
  members: [],
  items: [],
};
export const useAppStore = create<AppState & { actions: AppActions }>()(
  persist(
    immer((set) => ({
      ...initialState,
      actions: {
        addMember: (name, joiningDate) =>
          set((state) => {
            state.members.push({ id: uuidv4(), name, joiningDate, leaveDate: null });
          }),
        removeMember: (id) =>
          set((state) => {
            state.members = state.members.filter((member) => member.id !== id);
          }),
        updateMemberLeaveDate: (id, leaveDate) =>
          set((state) => {
            const member = state.members.find((m) => m.id === id);
            if (member) {
              member.leaveDate = leaveDate;
            }
          }),
        addItem: (item) =>
          set((state) => {
            state.items.push({ id: uuidv4(), ...item });
          }),
        editItem: (id, itemUpdate) =>
          set((state) => {
            const itemIndex = state.items.findIndex((item) => item.id === id);
            if (itemIndex !== -1) {
              state.items[itemIndex] = { ...state.items[itemIndex], ...itemUpdate };
            }
          }),
        removeItem: (id) =>
          set((state) => {
            state.items = state.items.filter((item) => item.id !== id);
          }),
        resetStore: () => set(initialState),
      },
    })),
    // Persist options: only enable storage when running in the browser
    (() => {
      const baseOptions: any = {
        name: 'fairshare-ledger-storage',
        // This is the key change: only persist the state, not the actions.
        partialize: (state: AppState) => ({ members: state.members, items: state.items }),
      };

      if (typeof window !== 'undefined') {
        baseOptions.storage = createJSONStorage(() => localStorage, {
          reviver: (key: string, value: unknown) => {
            if (['purchaseDate', 'leaveDate', 'joiningDate'].includes(key)) {
              if (value && typeof value === 'string') {
                const date = new Date(value);
                return isNaN(date.getTime()) ? null : date;
              }
            }
            return value;
          },
        });
      }

      return baseOptions;
    })()
  )
);
// --- Selectors ---
export const useMembers = () => useAppStore((state) => state.members);
export const useItems = () => useAppStore((state) => state.items);
export const useAppActions = () => useAppStore((state) => state.actions);
// --- Calculation Logic ---
export const calculateRefundForItem = (leavingMember: Member, item: Item, allMembers: Member[]): number => {
  if (!leavingMember.leaveDate || leavingMember.leaveDate <= item.purchaseDate) return 0;

  // If the member joined after purchase date, they don't pay anything (not present at purchase)
  if (leavingMember.joiningDate > item.purchaseDate) return 0;

  // Depreciation period in days: prefer explicit days, otherwise convert years -> days
  const depreciationDays = Math.max(1, Math.round((item.depreciationDays ?? (item.depreciationYears ? item.depreciationYears * 365 : 365))));

  const purchaseDate = item.purchaseDate;
  const depreciationEnd = addDays(new Date(purchaseDate.getTime()), depreciationDays - 1);

  // If leave after depreciation end, no refund
  if (leavingMember.leaveDate >= depreciationEnd) return 0;

  // Filter members who were present at purchase time (joined on or before purchase date)
  const membersAtPurchase = allMembers.filter(m => m.joiningDate <= purchaseDate);

  // The member only pays for days they were present during the depreciation window
  const startDate = purchaseDate; // Member was present at purchase, so start from purchase date
  const endDate = leavingMember.leaveDate < depreciationEnd ? leavingMember.leaveDate : depreciationEnd;
  if (endDate < startDate) return 0;

  const perDayValue = item.price / depreciationDays;
  let total = 0;
  const oneDayMs = 1000 * 60 * 60 * 24;

  const normalize = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let cursor = normalize(startDate);
  const last = normalize(endDate);

  while (cursor.getTime() <= last.getTime()) {
    // Count members (from those present at purchase) who are still present on this day
    const presentCount = membersAtPurchase.filter(m => {
      const jm = m.joiningDate;
      const lm = m.leaveDate;
      const day = cursor;
      // Member must have joined by this day (already filtered by membersAtPurchase)
      if (jm.getTime() > day.getTime()) return false;
      // Member must not have left before this day
      if (lm && lm.getTime() < day.getTime()) return false;
      return true;
    }).length;

    if (presentCount > 0) total += perDayValue / presentCount;

    cursor = new Date(cursor.getTime() + oneDayMs);
  }

  return total;
};
export const calculateTotalRefundForMember = (member: Member, items: Item[], allMembers: Member[]): number => {
  if (!member.leaveDate) return 0;
  const leaveDate = member.leaveDate;
  return items.reduce((total, item) => {
    // Only calculate for items purchased before the member leaves
    if (item.purchaseDate < leaveDate) {
      return total + calculateRefundForItem(member, item, allMembers);
    }
    return total;
  }, 0);
};