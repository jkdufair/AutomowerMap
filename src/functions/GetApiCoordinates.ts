import {app, input, output, InvocationContext, Timer} from "@azure/functions"
import {AutomowerPosition} from "../types/AutomowerPosition";
import {getTableRows} from "../shared/table";

const key = process.env['AUTOMOWER_APPLICATION_KEY']
const secret = process.env['AUTOMOWER_APPLICATION_SECRET']
const mowerId = process.env['AUTOMOWER_MOWER_ID']
const authEndpoint = 'https://api.authentication.husqvarnagroup.dev/v1/oauth2/token'
const endpoint = 'https://api.amc.husqvarna.dev/v1'
const frequencyMinutes = 10

interface Position {
	latitude: number
	longitude: number
}

interface MowerDataData {
	type: string
	id: string
	attributes: {
		system: any
		battery: any
		capabilities: any
		mower: any
		calendar: any
		planner: any
		metadata: any
		settings: any
		statistics: any
		positions: Array<Position>
	}
}

interface MowerData {
	data: MowerDataData
}

function positionArraysEqual(a: Array<Position>, b: Array<Position>) {
	if (a === b) return true
	if (a == null || b == null) return false
	if (a.length !== b.length) return false
	if (a.length === 0 || b.length === 0) return false
	for (let i = 0; i < a.length; ++i) {
		if (a[i].latitude !== b[i].latitude || a[i].longitude !== b[i].longitude) return false
	}
	return true
}

export async function getNewPositions(positions: Array<Position>, tableRows: Array<AutomowerPosition>, context: InvocationContext = null): Promise<Array<Position>> {
	// Diff with API coordinates
	// Find the index at which 2 (or however many remain) match the first n table rows
	const firstMatchingIndex = positions.findIndex((_, index) => {
		const positionsAtIndex = positions.slice(index, index + Math.min(3, tableRows.length))
		const tableRowsAtIndex = tableRows.map(row => ({
			latitude: row.latitude,
			longitude: row.longitude
		})).slice(0, positionsAtIndex.length)
		return positionArraysEqual(positionsAtIndex, tableRowsAtIndex)
	})
	context?.log('First matching index:', firstMatchingIndex)
	await new Promise(r => setTimeout(r, 100))
	if (firstMatchingIndex === -1) {
		// No match - all new positions
		return positions
	} else if (firstMatchingIndex === 0) {
		// All matching - no new positions
		return []
	} else {
		// Some matching - return the new positions
		return positions.slice(0, firstMatchingIndex)
	}
}

export async function GetApiCoordinates(myTimer: Timer, context: InvocationContext): Promise<Array<AutomowerPosition>> {
	// Get bearer token from API
	const response = await fetch(authEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `grant_type=client_credentials&client_id=${key}&client_secret=${secret}`
	})
	const authData = await response.json()

	// Get mower data from API
	const mowerResponse = await fetch(`${endpoint}/mowers/${mowerId}`, {
		headers: {
			'X-Api-Key': key,
			'Authorization-Provider': 'husqvarna',
			'Authorization': `Bearer ${authData.access_token}`
		}
	})
	// Positions come in descending order, newest to oldest
	const mowerData: MowerData = await mowerResponse.json()
	let positions = mowerData.data.attributes.positions
	context.log('API Positions:', positions)
	await new Promise(r => setTimeout(r, 100))

	// Get last coordinates from Table
	// Sometimes the mower API doesn't update for quite some time. We get, hopefully with 10 times the frequency,
	// enough rows to cover the gap
	const tableRows = await getTableRows(Math.min(frequencyMinutes * 10, 120))
	context.log('Table rows:', tableRows.map(row => {
		return {latitude: row.latitude, longitude: row.longitude}
	}))
	await new Promise(r => setTimeout(r, 100))

	const newPositions = (await getNewPositions(positions, tableRows, context)).reverse()
	context.log(`New positions: ${newPositions.length}`, newPositions)
	await new Promise(r => setTimeout(r, 100))

	// Save new coordinates
	const now = new Date().getTime().toString()
	// Store in ascending order, oldest to newest
	return newPositions.map(
		(position, index) => ({
			partitionKey: 'Dufair',
			rowKey: (now + index).toString().padStart(20, '0'),
			latitude: position.latitude,
			longitude: position.longitude
		})
	)
}

const tableOutput = output.table({
	connection: 'Storage',
	tableName: 'AutomowerPositions'
})

app.timer('GetApiCoordinates', {
	schedule: `0 0/${frequencyMinutes} * * * *`,
	handler: GetApiCoordinates,
	runOnStartup: true,
	return: tableOutput
})
