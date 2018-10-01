import { addr, CodeQuery, Contract, InitQuery, Template, TemplateFieldType } from "../../contract";

interface ConsumerTemplate {
    context: addr;
    address: addr;
    allowed: boolean;
    trader: addr;
    labels: string;
}

/**
 * Consumer address management contract.
 *
 * @author Daniël van de Giessen
 */
export default class ConsumerContract extends Contract<ConsumerTemplate> {
    public type: string = "Consumer";
    public version: string = "1.0";
    public description: string = "Manages the consumer addresses for a given context address.";

    public template: Template<ConsumerTemplate> = {
        context: { type: TemplateFieldType.addr, desc: "The context address for which to modify the consumer addresses", name: "context" },
        address: { type: TemplateFieldType.addr, desc: "The consumer address to allow or deny", name: "address" },
        allowed: { type: TemplateFieldType.bool, desc: "Whether to allow (true) or deny (false) the address", name: "allowed" },
        trader: { type: TemplateFieldType.addr, desc: "The trader linked to this consumer", name: "trader" },
        labels: { type: TemplateFieldType.str, desc: "The labels used when converting energy of this consumer", name: "labels" }
    };

    public async init(
        from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: InitQuery
    ): Promise<void> {
        await query("CREATE", "traders", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            PRIMARY KEY (context, address)
        )`, []);
        await query("CREATE", "consumers", `(
            context VARCHAR(35) NOT NULL,
            address VARCHAR(35) NOT NULL,
            trader VARCHAR(35) NOT NULL,
            labels TSVECTOR NOT NULL,
            PRIMARY KEY (context, address),
            FOREIGN KEY (context, trader) REFERENCES traders (context, address) ON DELETE RESTRICT
        )`, []);
    }

    public async code(
        payload: ConsumerTemplate, from: addr, block: number, miner: addr, previousBlockTimestamp: number, previousBlockHash: string, query: CodeQuery
    ): Promise<"OK" | string> {
        if (from !== payload.context) {
            return "Only the context owner can modify consumer addresses.";
        }

        if (payload.allowed) {
            if ((
                await query("SELECT", "traders", `
                    WHERE context = $1 AND address = $2
                `, [payload.context, payload.trader])
            ).rows.length !== 1) {
                return "The trader address is not allowed within the given context address.";
            }

            await query("INSERT", "consumers", `
                (context, address, trader, labels)
                VALUES ($1, $2, $3, STRIP($4::TSVECTOR))
                ON CONFLICT (context, address) DO UPDATE SET trader = $3, labels = STRIP($4::TSVECTOR)
            `, [payload.context, payload.address, payload.trader, payload.labels]);
        } else {
            await query("DELETE", "consumers", `
                WHERE context = $1 AND address = $2
            `, [payload.context, payload.address]);
        }
        return "OK";
    }
}
