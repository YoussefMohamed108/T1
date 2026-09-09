import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = { projects: [], deployments: [], domains: [] };

export class JsonStore {
  #file;
  #state = structuredClone(EMPTY_STATE);
  #writeQueue = Promise.resolve();

  constructor(dataDir) {
    this.#file = path.join(dataDir, 'state.json');
  }

  async init() {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.#file, 'utf8'));
      this.#state = { ...structuredClone(EMPTY_STATE), ...data };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#persist();
    }
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  async update(mutator) {
    const result = mutator(this.#state);
    await this.#persist();
    return structuredClone(result);
  }

  async #persist() {
    this.#writeQueue = this.#writeQueue.then(async () => {
      const temp = `${this.#file}.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(this.#state, null, 2)}\n`, 'utf8');
      await fs.rename(temp, this.#file);
    });
    return this.#writeQueue;
  }
}
