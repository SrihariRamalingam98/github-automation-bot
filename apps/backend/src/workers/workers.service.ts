import {
    Injectable,
    Logger,
    OnApplicationBootstrap,
    OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SessionEntity } from '../auth/entities/session.entity';
import { DatabaseService } from '../database/database.service';
import { EventProcessorService } from './event-processor.service';
import { EventQueueService } from './event-queue.service';

@Injectable()
export class WorkersService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger('Worker');

    private timer?: NodeJS.Timeout;

    private running?: Promise<void>;

    private stopping = false;

    constructor(
        private readonly queue: EventQueueService,
        private readonly processor: EventProcessorService,
        @InjectRepository(SessionEntity)
        private readonly sessions: Repository<SessionEntity>,
        private readonly db: DatabaseService,
    ) {}

    onApplicationBootstrap(): void {
        if (process.env.WORKER_ENABLED === 'false') return;
        this.timer = setInterval(() => this.tick(), 3000);
        this.tick();
    }

    async onModuleDestroy(): Promise<void> {
        this.stopping = true;
        clearInterval(this.timer);
        await this.running;
    }

    tick(): void {
        if (this.running || this.stopping) return;
        this.running = this.batch()
            .catch(() => {
                this.logger.error(
                    JSON.stringify({
                        event: 'worker_failed',
                        message:
                            'Processing interrupted. Durable leases will be retried.',
                    }),
                );
            })
            .finally(() => {
                this.running = undefined;
            });
    }

    private async batch(): Promise<void> {
        await this.queue.recoverExhausted();
        await this.db.execute('expire_sessions', () =>
            this.sessions.delete({ expiresAt: LessThan(new Date()) }),
        );
        for (let count = 0; count < 10 && !this.stopping; count++) {
            const claim = await this.queue.claim();
            if (!claim) break;
            await this.processor.process(claim);
        }
    }
}
