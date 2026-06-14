mod apply;
mod parser;
mod seek_sequence;
mod streaming_parser;

pub use apply::{
    apply_hunks_to_workdir, apply_patch_to_workdir, AppliedPatchChange, AppliedPatchFileChange,
    ApplyPatchError, ApplyPatchReport,
};
pub use parser::{
    parse_patch, ApplyPatchArgs, Hunk, ParseError, UpdateFileChunk, ADD_FILE_MARKER,
    BEGIN_PATCH_MARKER, DELETE_FILE_MARKER, END_PATCH_MARKER, UPDATE_FILE_MARKER,
};
pub use seek_sequence::seek_sequence;
pub use streaming_parser::StreamingPatchParser;
