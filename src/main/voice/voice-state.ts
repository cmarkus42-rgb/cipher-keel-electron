/**
 * VoiceStateMachine — state machine for voice conversation lifecycle.
 *
 * Ported from cipher-mux 0.9.x (CK-VOICE-001).
 */

export enum VoiceState {
  IDLE = 'idle',
  READY = 'ready',
  RECORDING = 'recording',
  USER_SPEAKING = 'user_speaking',
  PROCESSING = 'processing',
  AGENT_SPEAKING = 'agent_speaking',
  ERROR = 'error',
}

const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  [VoiceState.IDLE]: [VoiceState.READY],
  [VoiceState.READY]: [VoiceState.RECORDING, VoiceState.USER_SPEAKING, VoiceState.AGENT_SPEAKING, VoiceState.IDLE],
  [VoiceState.RECORDING]: [VoiceState.PROCESSING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.USER_SPEAKING]: [VoiceState.PROCESSING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.PROCESSING]: [VoiceState.AGENT_SPEAKING, VoiceState.READY, VoiceState.IDLE, VoiceState.ERROR],
  [VoiceState.AGENT_SPEAKING]: [VoiceState.USER_SPEAKING, VoiceState.READY, VoiceState.IDLE],
  [VoiceState.ERROR]: [VoiceState.READY, VoiceState.IDLE],
}

type TransitionCallback = (newState: VoiceState, oldState: VoiceState) => void

export class VoiceStateMachine {
  private _state: VoiceState = VoiceState.IDLE
  private _callbacks: TransitionCallback[] = []

  get state(): VoiceState {
    return this._state
  }

  transition(newState: VoiceState): boolean {
    const allowed = VALID_TRANSITIONS[this._state]
    if (!allowed.includes(newState)) {
      return false
    }
    const oldState = this._state
    this._state = newState
    for (const cb of this._callbacks) {
      cb(newState, oldState)
    }
    return true
  }

  onTransition(cb: TransitionCallback): void {
    this._callbacks.push(cb)
  }

  reset(): void {
    if (this._state !== VoiceState.IDLE) {
      const oldState = this._state
      this._state = VoiceState.IDLE
      for (const cb of this._callbacks) {
        cb(VoiceState.IDLE, oldState)
      }
    }
  }
}
