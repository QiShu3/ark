import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomizationSettings {
  backgroundUrl: string;
  backgroundBlur: number; // 0 to 20 px
  backgroundOpacity: number; // 0.1 to 1.0
  showCharacter: boolean;
  characterUrl: string;
  characterScale: number; // 0.5 to 1.5
  avatarUrl: string;
}

interface CustomizationState extends CustomizationSettings {
  updateSettings: (settings: Partial<CustomizationSettings>) => void;
  resetToDefault: () => void;
  loadFromServer: (data: Partial<CustomizationSettings>) => void;
}

export const DEFAULT_SETTINGS: CustomizationSettings = {
  backgroundUrl: `${import.meta.env.BASE_URL || '/'}images/background.jpg`,
  backgroundBlur: 0,
  backgroundOpacity: 0.6,
  showCharacter: true,
  characterUrl: `${import.meta.env.BASE_URL || '/'}images/chara.png`,
  characterScale: 1.0,
  avatarUrl: '',
};

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
      resetToDefault: () => set({ ...DEFAULT_SETTINGS }),
      loadFromServer: (data) => set((state) => ({ ...state, ...data })),
    }),
    {
      name: 'ark-customization',
    }
  )
);
