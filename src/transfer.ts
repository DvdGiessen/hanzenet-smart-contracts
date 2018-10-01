import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface TransferTemplate {
    context: addr;
    receiver: addr;
    block: number;
    labels: string;
    amount: number;
    description: string;
}

/**
 * Energy transfer contract.
 *
 * @author Daniël van de Giessen
 */
export default class TransferContract extends Contract<TransferTemplate> {
    public type: string = "Transfer";
    public version: string = "1.0";
    public description: string = "Transfers energy from one address to another.";

    public template: Template<TransferTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for the transfer", name: "context" },
        receiver: { type: TemplateFieldType.addr, desc: "The receiver of the energy", name: "receiver" },
        block: { type: TemplateFieldType.uint, desc: "The block for which energy is transfered", name: "block" },
        labels: { type: TemplateFieldType.str, desc: "The exact set of labels from which energy is transfered", name: "labels" },
        amount: { type: TemplateFieldType.float, desc: "The amount of energy to transfer", name: "amount" },
        description: { type: TemplateFieldType.str, desc: "An optional description for the transfer", name: "description" }
    };

    public async init(
        from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: InitQuery
    ): Promise<void> {
        await query("CREATE", "traders", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            PRIMARY KEY (context, address)
        )`, []);
        await query("CREATE", "energy", `(
            context VARCHAR(35) NOT NULL,
            trader VARCHAR(35) NOT NULL,
            block BIGINT NOT NULL,
            labels TSVECTOR NOT NULL,
            balance DECIMAL NOT NULL,
            PRIMARY KEY (context, trader, block, labels),
            FOREIGN KEY (context, trader) REFERENCES traders (context, address) ON DELETE CASCADE
        )`, []);
    }

    public async code(
        payload: TransferTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        if ((
            await query("SELECT", "traders", `
                WHERE context = $1 AND address = $2
            `, [payload.context, from])
        ).rows.length !== 1) {
            return "This address is not allowed to transfer within the given context address.";
        }

        if ((
            await query("SELECT", "traders", `
                WHERE context = $1 AND address = $2
            `, [payload.context, payload.receiver])
        ).rows.length !== 1) {
            return "The given receiver address is not allowed to transfer within the given context address.";
        }

        if (from === payload.receiver) {
            return "You cannot transfer to yourself.";
        }

        if (payload.amount <= 0) {
            return "The amount to transfer must be positive.";
        }

        const currentBalance = await query("SELECT", "energy", `
            WHERE context = $1 AND trader = $2 AND block = $3 AND labels = STRIP($4::TSVECTOR)
        `, [payload.context, from, payload.block, payload.labels]);
        if (currentBalance.rows.length !== 1) {
            return "This address does not have energy with the given labels in the given block.";
        }
        if (currentBalance.rows[0].balance < payload.amount) {
            return "This address does not have enough energy with the given labels in the given block.";
        }

        await query("UPDATE", "energy", `
            SET balance = energy.balance - $5
            WHERE context = $1 AND trader = $2 AND block = $3 AND labels = STRIP($4::TSVECTOR)
        `, [payload.context, from, payload.block, payload.labels, payload.amount]);
        await query("INSERT", "energy", `
            (context, trader, block, labels, balance)
            VALUES ($1, $2, $3, STRIP($4::TSVECTOR), $5)
            ON CONFLICT (context, trader, block, labels) DO UPDATE SET balance = energy.balance + EXCLUDED.balance
        `, [payload.context, payload.receiver, payload.block, payload.labels, payload.amount]);

        return "OK";
    }
}
