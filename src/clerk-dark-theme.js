import { dark } from '@clerk/themes';

export const clerkDarkTheme = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#81e6d9',
    colorBackground: '#2d3748',
    colorText: '#f7fafc',
    colorInputBackground: '#1a202c',
    colorInputText: '#f7fafc',
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
    userProfile: {
        colorText: '#f7fafc',
    }
  }
};
