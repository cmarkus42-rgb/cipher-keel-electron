/// <reference types="vite/client" />

import type { CipherKeelApi } from '../preload'

declare global {
  interface Window {
    cipherKeel: CipherKeelApi
  }
}
