import React, { createContext, useContext, useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore';
import { API } from '../utils/api';

type Theme = 'light' | 'dark' | 'oled';

const VALID_THEMES: Theme[] = ['light', 'dark', 'oled'];
const isValidTheme = (t: string): t is Theme => VALID_THEMES.includes(t as Theme);

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useConfigStore();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved && isValidTheme(saved)) {
      return saved;
    }
    return 'dark';
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Sync theme from config when it loads
  useEffect(() => {
    if (config?.theme && isValidTheme(config.theme)) {
      setTheme(config.theme);
      localStorage.setItem('theme', config.theme);
      setConfigLoaded(true);
    }
  }, [config?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Remove all theme classes, then add current
    // OLED theme extends dark, so keep 'dark' class for Tailwind dark: utilities
    root.classList.remove('light', 'dark', 'oled');
    body.classList.remove('light', 'dark', 'oled');
    if (theme === 'oled') {
      root.classList.add('dark', 'oled');
      body.classList.add('dark', 'oled');
    } else {
      root.classList.add(theme);
      body.classList.add(theme);
    }

    localStorage.setItem('theme', theme);

    if (configLoaded) {
      API.config.update({ theme }).catch(err => {
        console.error('Failed to save theme to config:', err);
      });
    }
  }, [theme, configLoaded]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
