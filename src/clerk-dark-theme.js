import { dark } from '@clerk/themes';

export const clerkDarkTheme = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#4fd1c5',
    colorBackground: '#2d3748',
    colorText: '#e2e8f0',
    colorInputBackground: '#1a202c',
    colorInputText: '#e2e8f0',
    colorNeutral: '#4a5568',
  },
  elements: {
    card: {
      backgroundColor: '#2d3748',
      borderColor: '#4a5568',
    },
    userButtonPopoverCard: {
      backgroundColor: '#2d3748',
      borderColor: '#4a5568',
    },
    userButtonPopoverMain: {
      backgroundColor: '#2d3748',
    },
    userButtonPopoverFooter: {
        backgroundColor: '#2d3748',
    },
    userProfileCard: {
        backgroundColor: '#2d3748',
        borderColor: '#4a5568',
    },
    userProfileMain: {
        backgroundColor: '#2d3748',
    },
  }
};
