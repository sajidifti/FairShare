import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { v4 as uuidv4 } from 'uuid';
import { differenceInDays, addYears, max, min } from 'date-fns';
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
  depreciationYears: number;
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
  if (!leavingMember.leaveDate || leavingMember.leaveDate <= item.purchaseDate) {
    return 0;
  }
  const depreciationEndDate = addYears(item.purchaseDate, item.depreciationYears);
  if (leavingMember.leaveDate >= depreciationEndDate) {
    return 0;
  }
  const totalDaysInPeriod = differenceInDays(depreciationEndDate, item.purchaseDate);
  if (totalDaysInPeriod <= 0) return 0;
  const dailyDepreciation = item.price / totalDaysInPeriod;
  const remainingValueAtLeaveDate = item.price - (differenceInDays(leavingMember.leaveDate, item.purchaseDate) * dailyDepreciation);
  // Find members who were present for this item's purchase and are still present when the member leaves
  const membersPresentForItem = allMembers.filter(m =>
    m.joiningDate <= item.purchaseDate && // Joined before or on purchase date
    (!m.leaveDate || m.leaveDate > item.purchaseDate) // Haven't left before purchase date
  );
  if (membersPresentForItem.length === 0) return 0;
  // The leaving member's share of the remaining value
  return remainingValueAtLeaveDate / membersPresentForItem.length;
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