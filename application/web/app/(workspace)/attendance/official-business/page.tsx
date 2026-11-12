import {Suspense} from 'react';
import AuthorizedWorkspacePage from '../../../components/authorized-workspace-page';
import {OfficialBusinessEntry} from '../../../attendance/official-business/entry';
export default function OfficialBusinessPage(){return <AuthorizedWorkspacePage access="portal" returnPath="/attendance/official-business"><Suspense fallback={<p role="status">Loading Official Business...</p>}><OfficialBusinessEntry/></Suspense></AuthorizedWorkspacePage>;}
