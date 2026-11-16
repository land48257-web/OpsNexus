import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';


// Configure monaco-editor to use the local installation instead of CDN
loader.config({ monaco });

export default monaco;
