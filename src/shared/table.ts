import {TableClient} from "@azure/data-tables"
import {AutomowerPosition} from "../types/AutomowerPosition";

export const getTableRows = async (minutes: number) => {
	const tableClient = TableClient.fromConnectionString(process.env['AzureWebJobsStorage'], 'AutomowerPositions')
	const filterDate = new Date()
	filterDate.setMinutes(filterDate.getMinutes() - minutes)
	const iterator = tableClient.listEntities<AutomowerPosition>({
		queryOptions: {
			filter: `Timestamp gt datetime'${filterDate.toISOString()}'`
		}
	})
	let tableRows: Array<AutomowerPosition> = []
	for await (const row of iterator) {
		tableRows.push(row)
	}
	// Sort in descending order, newest to oldest
	return tableRows.sort((a, b) => parseInt(b.rowKey) - parseInt(a.rowKey))
}
