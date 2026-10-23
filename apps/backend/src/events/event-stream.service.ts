import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthRequest } from '../common/interfaces/auth-request.interface';

@Injectable()
export class EventStreamService {
    private readonly logger = new Logger('EventStream');

    constructor(private readonly auth: AuthService) {}

    open(req: AuthRequest, res: Response): void {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        res.write(': connected\n\n');
        let checking = false;
        const timer = setInterval(() => {
            void (async () => {
                if (checking || res.writableEnded) return;
                checking = true;
                try {
                    if (!(await this.auth.isActiveSession(req.sessionId))) {
                        res.write('event: expired\ndata: {}\n\n');
                        clearInterval(timer);
                        res.end();
                        return;
                    }
                    res.write('event: refresh\ndata: {}\n\n');
                } catch {
                    this.logger.warn(
                        JSON.stringify({
                            event: 'stream_session_check_failed',
                        }),
                    );
                    res.write('event: unavailable\ndata: {}\n\n');
                    clearInterval(timer);
                    res.end();
                } finally {
                    checking = false;
                }
            })();
        }, 5000);
        const cleanup = () => clearInterval(timer);
        res.on('close', cleanup);
        req.on('close', cleanup);
    }
}
