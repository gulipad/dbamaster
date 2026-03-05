import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitProgress(message: string) {
  emitter.emit('progress', message);
}

export function onProgress(callback: (message: string) => void): () => void {
  emitter.on('progress', callback);
  return () => {
    emitter.removeListener('progress', callback);
  };
}
