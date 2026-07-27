export interface AuthEpoch {
  epoch: number;
  userId: string | null;
}

export class AuthTransitionCoordinator {
  #epoch = 0;
  #userId: string | null = null;

  begin(userId: string | null): AuthEpoch {
    this.#epoch += 1;
    this.#userId = userId;
    return { epoch: this.#epoch, userId };
  }

  isCurrent(candidate: AuthEpoch): boolean {
    return candidate.epoch === this.#epoch && candidate.userId === this.#userId;
  }

  current(): AuthEpoch {
    return { epoch: this.#epoch, userId: this.#userId };
  }
}
