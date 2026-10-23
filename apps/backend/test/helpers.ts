import { EntityManager, Repository } from 'typeorm';
import { DatabaseService } from '../src/database/database.service';
export function databaseStub(manager?: unknown): DatabaseService {
    return {
        execute: jest.fn(
            async (_operation: string, work: () => Promise<unknown>) => work(),
        ),
        transaction: jest.fn(
            async (
                _operation: string,
                work: (manager: unknown) => Promise<unknown>,
            ) => work(manager),
        ),
    } as unknown as DatabaseService;
}
export function builder() {
    const value = {
        getOne: jest.fn(),
        getMany: jest.fn(),
        getCount: jest.fn(),
        execute: jest.fn(),
        insert: jest.fn(),
        values: jest.fn(),
        onConflict: jest.fn(),
        returning: jest.fn(),
        updateEntity: jest.fn(),
        select: jest.fn(),
        innerJoin: jest.fn(),
        innerJoinAndSelect: jest.fn(),
        leftJoinAndSelect: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        take: jest.fn(),
        setLock: jest.fn(),
        setOnLocked: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
    };
    for (const key of [
        'insert',
        'values',
        'onConflict',
        'returning',
        'updateEntity',
        'select',
        'innerJoin',
        'innerJoinAndSelect',
        'leftJoinAndSelect',
        'addSelect',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'take',
        'setLock',
        'setOnLocked',
        'update',
        'set',
    ] as const)
        value[key].mockReturnValue(value);
    return value;
}
export function repository<T extends object>(value: unknown): Repository<T> {
    return value as Repository<T>;
}
export function manager(value: unknown): EntityManager {
    return value as EntityManager;
}
