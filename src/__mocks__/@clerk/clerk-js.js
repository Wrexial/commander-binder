export class Clerk {
  constructor(key) {
    console.log(`Clerk constructor called with key: ${key}`);
  }

  async load(options) {
    console.log('Clerk load called with options:', options);
  }

  mountUserButton(element) {
    console.log('mountUserButton called with element:', element);
  }

  get user() {
    return {
      id: 'user_123'
    };
  }
  
  get session() {
    return {
        getToken: () => Promise.resolve('test-token')
    }
  }
}
