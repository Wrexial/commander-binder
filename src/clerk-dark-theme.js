import { dark } from '@clerk/themes';

export const clerkDarkTheme = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#5a9fdc',
    colorBackground: '#1e1e1e',
    colorText: '#e0e0e0',
    colorInputBackground: '#2c2c2c',
    colorInputText: '#e0e0e0',
    colorNeutral: '#555',
  },
  elements: {
    card: {
      backgroundColor: '#1e1e1e',
      borderColor: '#555',
    },
    userButtonPopoverCard: {
      backgroundColor: '#1e1e1e',
      borderColor: '#555',
    },
    userButtonPopoverMain: {
      backgroundColor: '#1e1e1e',
    },
    userButtonPopoverFooter: {
        backgroundColor: '#1e1e1e',
    },
    userProfileCard: {
        backgroundColor: '#1e1e1e',
        borderColor: '#555',
    },
    userProfileMain: {
        backgroundColor: '#1e1e1e',
    },
  }
};
