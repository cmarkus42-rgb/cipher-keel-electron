/**
 * Audio utility functions for the voice pipeline.
 *
 * Ported from cipher-mux 0.9.x.
 */

/**
 * Convert Float32 PCM [-1.0, 1.0] to WAV file buffer with RIFF header.
 * 1 channel, 16-bit PCM, proper header at offset 0-43.
 */
export function pcmToWav(pcmData: Float32Array, sampleRate: number): Buffer {
  if (!pcmData || pcmData.length === 0) {
    throw new Error('PCM data is empty')
  }

  const numSamples = pcmData.length
  const bytesPerSample = 2 // 16-bit
  const numChannels = 1
  const dataSize = numSamples * bytesPerSample
  const headerSize = 44
  const fileSize = headerSize + dataSize

  const buffer = Buffer.alloc(fileSize)

  // RIFF header
  buffer.write('RIFF', 0, 4, 'ascii')
  buffer.writeUInt32LE(fileSize - 8, 4)
  buffer.write('WAVE', 8, 4, 'ascii')

  // fmt sub-chunk
  buffer.write('fmt ', 12, 4, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)  // PCM format
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28)
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32)
  buffer.writeUInt16LE(bytesPerSample * 8, 34)

  // data sub-chunk
  buffer.write('data', 36, 4, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  // Convert Float32 samples to Int16
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]))
    const int16 = sample >= 0
      ? Math.round(sample * 32767)
      : Math.round(sample * 32768)
    buffer.writeInt16LE(int16, headerSize + i * bytesPerSample)
  }

  return buffer
}

/**
 * Concatenate multiple WAV buffers (same format: mono 16-bit PCM, same sampleRate)
 * into a single WAV buffer.
 */
export function concatenateWavs(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) return Buffer.alloc(0)
  if (wavBuffers.length === 1) return wavBuffers[0]

  const headerSize = 44
  let totalPcmBytes = 0
  for (const wav of wavBuffers) {
    totalPcmBytes += wav.length - headerSize
  }

  const result = Buffer.alloc(headerSize + totalPcmBytes)
  wavBuffers[0].copy(result, 0, 0, headerSize)

  let offset = headerSize
  for (const wav of wavBuffers) {
    wav.copy(result, offset, headerSize)
    offset += wav.length - headerSize
  }

  result.writeUInt32LE(result.length - 8, 4)
  result.writeUInt32LE(totalPcmBytes, 40)

  return result
}
