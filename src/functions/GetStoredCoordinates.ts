import {app, HttpRequest, HttpResponseInit, InvocationContext} from "@azure/functions";
import {getTableRows} from "../shared/table";

export async function GetStoredCoordinates(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
	const minutesQuery = request.query.get('minutes') ?? '60'
	let minutes = parseInt(minutesQuery)
	if (isNaN(minutes)) minutes = 60
	return {
		jsonBody: (await getTableRows(minutes))
			.map(row => ({
				lat: row.latitude,
				lng: row.longitude
			}))
	}
}

app.http('GetStoredCoordinates', {
	methods: ['GET'],
	authLevel: 'anonymous',
	handler: GetStoredCoordinates
})
